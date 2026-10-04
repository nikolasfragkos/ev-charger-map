import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { verifyToken } from "../middleware/verifyToken.ts";

const router = express.Router();

// Date format helper
function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const getSessions = async (req: Request, res: Response) => {
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
        return res.status(400).json(makeErrorLog(req, 400, "Invalid date format. Use YYYYMMDD"));
    }

    const sessions = await prisma.session.findMany({
        where: {
            chargerId: chargerId,
            startedAt: { gte: fromDate, lte: toDate }
        },
        orderBy: { startedAt: 'desc' }
    });

    // Mapping
    const responseData = sessions.map(s => ({
        starttime: formatDate(s.startedAt),
        endtime: formatDate(s.endedAt),
        // Προσοχή: Αν στη βάση έχεις πεδία startSoc/endSoc, βάλ' τα εδώ αντί για 0
        startsoc: 0, 
        endsoc: 0,
        totalkwh: Number(s.kWh),
        kwhprice: Number(s.pricePerKWh),
        amount: Number(s.costEur)
    }));

    return res.status(200).json(responseData);

  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

router.get("/:id/:from/:to", verifyToken, getSessions);

export default router;