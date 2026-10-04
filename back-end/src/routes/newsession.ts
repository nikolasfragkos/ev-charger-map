import express, { Request, Response } from "express";
import prisma from "../prisma/client.js";
import { makeErrorLog } from "../middleware/errorHandler.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { SessionStatus, ReservationStatus } from "@prisma/client"; 

const router = express.Router();

const handleNewSession = async (req: Request, res: Response) => {
  try {
    const { 
        pointid,
        starttime, 
        endtime, 
        startsoc, 
        endsoc, 
        totalkwh, 
        kwhprice, 
        amount 
    } = req.body;

    if (!pointid || !starttime || !endtime || !totalkwh || kwhprice === undefined || amount === undefined) {
        const err = makeErrorLog(req, 400, "Missing required fields");
        return res.status(400).json(err);
    }

    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const charger = await prisma.charger.findUnique({
        where: { id: Number(pointid) },
        include: {
            reservations: {
                where: {
                    status: ReservationStatus.ACTIVE,
                    expiresAt: { gt: new Date() }
                }
            }
        }
    });

    if (!charger) {
        return res.status(400).json(makeErrorLog(req, 400, "Invalid pointid: Charger not found"));
    }

    if (charger.status !== "AVAILABLE") {
        // Find if any reservation belongs to user
        const myReservation = charger.reservations.find((r: any) => r.userId === userId);

        if (myReservation) {
            await prisma.reservation.update({
                where: { id: myReservation.id },
                data: { status: ReservationStatus.EXPIRED } 
            });
        } else {
            const latestSession = await prisma.session.findFirst({
                where: { chargerId: Number(pointid) },
                orderBy: { startedAt: "desc" },
                select: { userId: true }
            });

            if (charger.status === "OUTAGE" || latestSession?.userId !== userId) {
                const msg = charger.status === "OUTAGE" 
                    ? "Charger is out of order" 
                    : "Charger is currently in use or reserved by another user";
                
                return res.status(403).json(makeErrorLog(req, 403, msg));
            }
        }
    }

    const start = new Date(starttime);
    const end = new Date(endtime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        const err = makeErrorLog(req, 400, "Invalid date format");
        return res.status(400).json(err);
    }

    await prisma.session.create({
        data: {
            userId: userId,
            chargerId: Number(pointid),
            startedAt: start,
            endedAt: end,
            kWh: Number(totalkwh),
            pricePerKWh: Number(kwhprice),
            costEur: Number(amount),
            status: SessionStatus.COMPLETED, 
        }
    });

    return res.status(200).send();

  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

router.post("/", verifyToken, handleNewSession);

export default router;