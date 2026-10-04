import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { verifyToken } from "../middleware/verifyToken.ts";
import { ChargerStatus, ReservationStatus, SessionStatus } from "@prisma/client";
import { captureOrRecharge } from "../controllers/paymentController.ts";
import { setChargerStatusRedis, cancelReservationRedis } from "../services/availabilityRedis.ts";

const router = express.Router();
router.use(verifyToken);

// Date format helper - Format: YYYY-MM-DD hh:mm
function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── POST /charging/start ── */
router.post("/start", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { reservationId, batteryCapacityKWh, currentBatteryLevel } = req.body;

    if (!reservationId || typeof reservationId !== "number") {
      return res.status(400).json({ error: "reservationId (number) is required" });
    }

    let maxKWh: number | null = null;
    if (typeof batteryCapacityKWh === "number" && typeof currentBatteryLevel === "number") {
      maxKWh = parseFloat(((batteryCapacityKWh * (100 - currentBatteryLevel)) / 100).toFixed(3));
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { charger: true },
    });

    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    if (reservation.userId !== userId) return res.status(403).json({ error: "Reservation does not belong to you" });
    if (reservation.status !== ReservationStatus.ACTIVE) return res.status(409).json({ error: "Reservation is no longer active" });
    if (reservation.expiresAt < new Date()) return res.status(410).json({ error: "Reservation has expired" });

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          userId,
          chargerId: reservation.chargerId,
          reservationId: reservation.id,
          startedAt: new Date(),
          kWh: 0,
          maxKWh,
          pricePerKWh: reservation.charger.kwhprice,
          status: SessionStatus.RUNNING,
        },
      });

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.EXPIRED },
      });

      await tx.charger.update({
        where: { id: reservation.chargerId },
        data: { status: ChargerStatus.IN_USE },
      });

      return s;
    });

    // ✅ Clear Redis reservation keys (reservation consumed) + set in_use (no TTL)
    await cancelReservationRedis({ userId, chargerId: reservation.chargerId });
    await setChargerStatusRedis(reservation.chargerId, "in_use");

    return res.status(201).json({
      sessionId: session.id,
      chargerId: reservation.chargerId,
      startedAt: formatDate(session.startedAt),
      pricePerKWh: Number(reservation.charger.kwhprice),
      maxKW: reservation.charger.maxKW,
    });
  } catch (err: any) {
    console.error("[charging/start] error:", err);
    return res.status(500).json({ error: "Failed to start charging", details: err.message });
  }
});

/* ── POST /charging/stop ── */
router.post("/stop", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== "number") {
      return res.status(400).json({ error: "sessionId (number) is required" });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { charger: true, reservation: true },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Session does not belong to you" });
    if (session.status !== SessionStatus.RUNNING) return res.status(409).json({ error: "Session is not running" });

    const now = new Date();
    const elapsedHours = (now.getTime() - session.startedAt.getTime()) / 3_600_000;
    let finalKWh = parseFloat((elapsedHours * session.charger.maxKW).toFixed(3));
    if (session.maxKWh !== null && finalKWh > session.maxKWh) finalKWh = session.maxKWh;

    const pricePerKWh = Number(session.pricePerKWh ?? session.charger.kwhprice);
    const costEur = parseFloat((finalKWh * pricePerKWh).toFixed(2));

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: { endedAt: now, kWh: finalKWh, costEur, status: SessionStatus.USER_STOPPED },
      }),
      prisma.charger.update({
        where: { id: session.chargerId },
        data: { status: ChargerStatus.AVAILABLE },
      }),
    ]);

    // ✅ Redis: available again
    await setChargerStatusRedis(session.chargerId, "available");

    const paymentIntentId = session.reservation?.paymentIntentId;
    let paymentStatus = "no_pre_auth";

    if (paymentIntentId) {
      try {
        const intent = await captureOrRecharge(paymentIntentId, costEur, sessionId, userId);
        paymentStatus = intent.status;
      } catch (payErr: any) {
        console.error("[charging/stop] payment failed:", payErr.message);
        paymentStatus = "failed";
      }
    }

    return res.json({ sessionId, kWh: finalKWh, costEur, paymentStatus });
  } catch (err: any) {
    console.error("[charging/stop] error:", err);
    return res.status(500).json({ error: "Failed to stop charging", details: err.message });
  }
});

/* ── GET /charging/status/:sessionId ── */
router.get("/status/:sessionId", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const sessionId = Number(req.params.sessionId);

    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid sessionId" });

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { charger: true, reservation: true },
    });

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Session does not belong to you" });

    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
    const elapsedHours = elapsedSeconds / 3600;

    let kWh = session.kWh;
    let costSoFar = Number(session.costEur ?? 0);

    if (session.status === SessionStatus.RUNNING) {
      kWh = parseFloat((elapsedHours * session.charger.maxKW).toFixed(3));

      const cap = session.maxKWh;
      let isFull = false;
      if (cap !== null && kWh >= cap) {
        kWh = cap;
        isFull = true;
      }

      const pricePerKWh = Number(session.pricePerKWh ?? session.charger.kwhprice);
      costSoFar = parseFloat((kWh * pricePerKWh).toFixed(2));

      if (isFull) {
        const endedAt = new Date();
        await prisma.$transaction([
          prisma.session.update({
            where: { id: sessionId },
            data: { kWh, costEur: costSoFar, endedAt, status: SessionStatus.AUTO_STOPPED },
          }),
          prisma.charger.update({
            where: { id: session.chargerId },
            data: { status: ChargerStatus.AVAILABLE },
          }),
        ]);

        // ✅ Redis: available again
        await setChargerStatusRedis(session.chargerId, "available");

        // Capture payment on auto-stop
        const autoPaymentIntentId = session.reservation?.paymentIntentId;
        let autoPaymentStatus = "no_pre_auth";
        if (autoPaymentIntentId) {
          try {
            const intent = await captureOrRecharge(autoPaymentIntentId, costSoFar, sessionId, userId);
            autoPaymentStatus = intent.status;
          } catch (payErr: any) {
            console.error("[charging/status] auto-stop payment failed:", payErr.message);
            autoPaymentStatus = "failed";
          }
        }

        return res.json({
          sessionId,
          status: SessionStatus.AUTO_STOPPED,
          kWh,
          costSoFar,
          elapsedSeconds,
          maxKW: session.charger.maxKW,
          maxKWh: cap,
          pricePerKWh,
          paymentStatus: autoPaymentStatus,
        });
      }

      await prisma.session.update({ where: { id: sessionId }, data: { kWh } });
    }

    return res.json({
      sessionId,
      status: session.status,
      kWh,
      costSoFar,
      elapsedSeconds,
      maxKW: session.charger.maxKW,
      maxKWh: session.maxKWh,
      pricePerKWh: Number(session.pricePerKWh ?? session.charger.kwhprice),
    });
  } catch (err: any) {
    console.error("[charging/status] error:", err);
    return res.status(500).json({ error: "Failed to get charging status", details: err.message });
  }
});

/* ── GET /charging/active ── */
router.get("/active", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const session = await prisma.session.findFirst({
      where: { userId, status: SessionStatus.RUNNING },
      include: { charger: true },
    });

    const reservation = await prisma.reservation.findFirst({
      where: { userId, status: ReservationStatus.ACTIVE, expiresAt: { gt: new Date() } },
    });

    if (!session && !reservation) return res.json({ session: null, reservation: null });

    let sessionData = null;
    if (session) {
      const now = new Date();
      const elapsedSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
      const elapsedHours = elapsedSeconds / 3600;

      let kWh = parseFloat((elapsedHours * session.charger.maxKW).toFixed(3));
      if (session.maxKWh !== null && kWh > session.maxKWh) kWh = session.maxKWh;

      const pricePerKWh = Number(session.pricePerKWh ?? session.charger.kwhprice);
      const costSoFar = parseFloat((kWh * pricePerKWh).toFixed(2));

      sessionData = {
        sessionId: session.id,
        chargerId: session.chargerId,
        status: session.status,
        kWh,
        costSoFar,
        elapsedSeconds,
        maxKW: session.charger.maxKW,
        maxKWh: session.maxKWh,
        pricePerKWh,
      };
    }

    let reservationData = null;
    if (reservation) {
      reservationData = {
        reservationId: reservation.id,
        chargerId: reservation.chargerId,
        expiresAt: formatDate(reservation.expiresAt),
        startsAt: formatDate(reservation.startsAt),
      };
    }

    return res.json({ session: sessionData, reservation: reservationData });
  } catch (err: any) {
    console.error("[charging/active] error:", err);
    return res.status(500).json({ error: "Failed to get active session", details: err.message });
  }
});

export default router;
