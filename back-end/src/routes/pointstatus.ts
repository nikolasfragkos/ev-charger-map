import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { verifyToken } from "../middleware/verifyToken.ts";

const router = express.Router();

function formatDate(d: Date): string {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const getPointStatus = async (req: Request, res: Response) => {
  try {
    const { id, from, to } = req.params;
    const chargerId = Number(id);

    if (isNaN(chargerId)) {
        return res.status(400).json(makeErrorLog(req, 400, "Invalid charger ID"));
    }

    // Parsing YYYYMMDD
    const parseDateParam = (dateStr: string, isEndOfDay = false) => {
        if (!/^\d{8}$/.test(dateStr)) return null;
        const y = Number(dateStr.substring(0, 4));
        const m = Number(dateStr.substring(4, 6)) - 1;
        const d = Number(dateStr.substring(6, 8));
        const date = new Date(y, m, d);
        if (isEndOfDay) date.setHours(23, 59, 59, 999);
        else date.setHours(0, 0, 0, 0);
        return date;
    };

    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to, true);

    if (!fromDate || !toDate) {
        return res.status(400).json(makeErrorLog(req, 400, "Invalid date format"));
    }

    // 1. Φέρνουμε τα Sessions (Φορτίσεις)
    const sessions = await prisma.session.findMany({
        where: {
            chargerId: chargerId,
            startedAt: { gte: fromDate, lte: toDate }
        }
    });

    // 2. Φέρνουμε τα Reservations (Κρατήσεις) - ΠΡΟΣΘΗΚΗ
    const reservations = await prisma.reservation.findMany({
        where: {
            chargerId: chargerId,
            startsAt: { gte: fromDate, lte: toDate }
        }
    });

    let history: any[] = [];

    // --- Επεξεργασία Sessions ---
    sessions.forEach(s => {
        // Available (or Reserved) -> Charging
        history.push({
            timeref: s.startedAt,
            old_state: "available", // Ή 'reserved' αν υπήρχε κράτηση, αλλά για απλότητα 'available'
            new_state: "charging" 
        });

        // Charging -> Available
        if (s.endedAt && s.endedAt <= toDate) {
             history.push({
                timeref: s.endedAt,
                old_state: "charging",
                new_state: "available"
            });
        }
    });

    // --- Επεξεργασία Reservations (ΠΡΟΣΘΗΚΗ) ---
    reservations.forEach(r => {
        // Event: Available -> Reserved
        history.push({
            timeref: r.startsAt,
            old_state: "available",
            new_state: "reserved"
        });

        // Αν έληξε και δεν έγινε Session (Status = EXPIRED), τότε Reserved -> Available
        // (Αν έγινε session, το αναλαμβάνει το session logic παραπάνω)
        if (r.status === 'EXPIRED' && r.expiresAt <= toDate) {
             history.push({
                timeref: r.expiresAt,
                old_state: "reserved",
                new_state: "available"
            });
        }
    });

    // Sort descending by timestamp
    history.sort((a, b) => b.timeref.getTime() - a.timeref.getTime());

    // Map to Output Fields
    const responseData = history.map(h => ({
        timeref: formatDate(h.timeref),
        old_state: h.old_state,
        new_state: h.new_state
    }));

    return res.status(200).json(responseData);

  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

router.get("/:id/:from/:to", verifyToken, getPointStatus);

export default router;