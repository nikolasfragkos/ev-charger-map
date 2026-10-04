// src/index.ts
import express from "express";
import cors from "cors";

import chargersRouter from "./routes/chargers.ts";
import meRouter from "./routes/me.ts";
import authRouter from "./routes/auth.ts";
import adminRouter from "./routes/admin/index.ts";
import pointsRouter from "./routes/points.ts";
import reserveRouter from "./routes/reserve.ts";
import updpointRouter from "./routes/updpoint.ts";
import newsessionRouter from "./routes/newsession.ts";
import sessionsRouter from "./routes/sessions.ts";
import pointStatusRouter from "./routes/pointstatus.ts";
import paymentRouter from "./routes/payment.ts";
import { schedulePricingUpdates } from "./pricing/scheduler.ts";
import carsRouter from './routes/cars.ts'
import carOwnershipRouter from "./routes/carOwnership.ts"
import mockRouter from "./routes/mock.ts";
import chargingRouter from "./routes/charging.ts";
import prisma from "./prisma/client.ts";
import { cancelPreAuth } from "./controllers/paymentController.ts";
import { ChargerStatus, ReservationStatus } from "@prisma/client";

const app = express();

app.use(cors());
app.use(express.json());

// --- Application routes ---
app.use("/api/v1/points", pointsRouter);
app.use("/api/v1/point", pointsRouter);
app.use("/api/v1/reserve", reserveRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/me", meRouter);
app.use("/api/v1/chargers", chargersRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/updpoint", updpointRouter);
app.use("/api/v1/newsession", newsessionRouter);
app.use("/api/v1/sessions", sessionsRouter);
app.use("/api/v1/pointstatus", pointStatusRouter);
app.use("/api/v1/payments", paymentRouter);
app.use('/api/v1/cars', carsRouter)
app.use("/api/v1/car-ownership", carOwnershipRouter)
app.use("/api/v1/mock", mockRouter);
app.use("/api/v1/charging", chargingRouter);

// simple generic system health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 9876);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}
if (process.env.ENABLE_PRICING === "1") {
  schedulePricingUpdates();
}

// Expired reservation cleanup — cancel pre-auth holds and free chargers
setInterval(async () => {
  try {
    const expired = await prisma.reservation.findMany({
      where: { status: ReservationStatus.ACTIVE, expiresAt: { lt: new Date() } },
    });
    for (const r of expired) {
      if (r.paymentIntentId) {
        try { await cancelPreAuth(r.paymentIntentId); } catch (e) { console.error("[expiry] cancel pre-auth error:", e); }
      }
      await prisma.$transaction([
        prisma.reservation.update({ where: { id: r.id }, data: { status: ReservationStatus.EXPIRED } }),
        prisma.charger.update({ where: { id: r.chargerId }, data: { status: ChargerStatus.AVAILABLE } }),
      ]);
      console.log(`[expiry] Reservation ${r.id} expired, charger ${r.chargerId} freed`);
    }
  } catch (e) {
    console.error("[expiry] cleanup error:", e);
  }
}, 60_000);

export default app;