import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { optionalToken } from "../middleware/optionalToken.ts";
import { ChargerStatus, ReservationStatus } from "@prisma/client";

const router = express.Router();

const apiToDbStatus: Record<string, ChargerStatus> = {
  available: ChargerStatus.AVAILABLE,
  in_use: ChargerStatus.IN_USE,
  charging: ChargerStatus.IN_USE,
  reserved: ChargerStatus.IN_USE,
  outage: ChargerStatus.OUTAGE,
  offline: ChargerStatus.OUTAGE,
  outoforder: ChargerStatus.OUTAGE,
};

const getStatusString = (db: ChargerStatus): string => {
  switch (db) {
    case ChargerStatus.AVAILABLE: return "available";
    case ChargerStatus.IN_USE: return "in_use";
    case ChargerStatus.OUTAGE: return "outage";
    default: return "unknown";
  }
};

const allowedStatuses = Object.keys(apiToDbStatus).join(", ");

// GET /points
router.get("/", optionalToken, async (req, res) => {
  try {
    const currentUserId = req.userId; // Το ID του χρήστη που κάνει το αίτημα

    // --- ΒΗΜΑ 1: Lazy Cleanup ---
    const now = new Date();
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        expiresAt: { lt: now }
      },
      select: { id: true, chargerId: true }
    });

    if (expiredReservations.length > 0) {
       const reservationIds = expiredReservations.map(r => r.id);
       const chargerIds = expiredReservations.map(r => r.chargerId);
       
       await prisma.$transaction([
         prisma.reservation.updateMany({
           where: { id: { in: reservationIds } },
           data: { status: ReservationStatus.EXPIRED }
         }),
         prisma.charger.updateMany({
           where: { id: { in: chargerIds }, status: ChargerStatus.IN_USE },
           data: { status: ChargerStatus.AVAILABLE }
         })
       ]);
    }
    // ------------------------------------------

    // --- ΒΗΜΑ 2: Βρες ποιους φορτιστές έχει κλείσει ο ΤΡΕΧΩΝ χρήστης ---
    const myActiveReservations = currentUserId ? await prisma.reservation.findMany({
        where: {
            userId: currentUserId,
            status: ReservationStatus.ACTIVE,
            expiresAt: { gt: new Date() } // Που δεν έχουν λήξει
        },
        select: { chargerId: true }
 
  })
    
  : [];
    // Φτιάχνουμε ένα Set με τα IDs για γρήγορη αναζήτηση
    const myReservedChargerIds = new Set(myActiveReservations.map(r => r.chargerId));

    // --- ΒΗΜΑ 3: Ανάκτηση Φορτιστών ---
    const { status } = req.query;
    let where: { status?: ChargerStatus } = {};

    if (status !== undefined) {
      const statusStr = String(status).toLowerCase();
      if (!(statusStr in apiToDbStatus)) {
        return res.status(400).json(makeErrorLog(req, 400, `Invalid status. Allowed: ${allowedStatuses}`));
      }
      where.status = apiToDbStatus[statusStr];
    }

    const chargers = await prisma.charger.findMany({ 
        where,
        orderBy: { id: 'asc' }
    });

    if (chargers.length === 0) return res.status(200).json([]);

    const result = chargers.map((c) => {
      // Ελέγχουμε αν αυτός ο φορτιστής είναι κρατημένος από ΕΜΑΣ
      const isMine = myReservedChargerIds.has(c.id);

      return {
        pointid: c.id,
        providerName: c.providerName || "unknown",
        name: c.name,
        address: c.address ?? "",
        connectorType: c.connectorType,
        lon: String(c.lng),
        lat: String(c.lat),
        status: getStatusString(c.status),
        cap: c.maxKW,
        kwhprice: c.kwhprice,
        reserved_by_me: isMine 
      };
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
});

// GET /points/:id
router.get("/:id", optionalToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json(makeErrorLog(req, 400, "Invalid ID"));

    // --- LAZY UPDATE (Specific Charger) ---
    // Πριν φέρουμε τον φορτιστή, ελέγχουμε αν έχει ληγμένη κράτηση ΚΑΙ ΕΙΝΑΙ ΑΥΤΟΣ
    const now = new Date();
    const expiredRes = await prisma.reservation.findFirst({
        where: {
            chargerId: id,
            status: "ACTIVE", // ή ReservationStatus.ACTIVE
            expiresAt: { lt: now }
        }
    });

    if (expiredRes) {
        // Καθαρισμός ΤΩΡΑ
        await prisma.$transaction([
            prisma.reservation.update({
                where: { id: expiredRes.id },
                data: { status: "EXPIRED" } // ή ReservationStatus.EXPIRED
            }),
            prisma.charger.update({
                where: { id: id },
                data: { status: "AVAILABLE" } // ή ChargerStatus.AVAILABLE
            })
        ]);
    }
    // --------------------------------------

    const charger = await prisma.charger.findUnique({ where: { id } });
    if (!charger) return res.status(404).json(makeErrorLog(req, 404, "Not found"));

    // Τώρα φέρνουμε την κράτηση (αν υπάρχει ακόμα ενεργή)
    const activeReservation = await prisma.reservation.findFirst({
      where: {
        chargerId: charger.id,
        status: "ACTIVE", // ή ReservationStatus.ACTIVE
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: "desc" },
    });
    
    // Έλεγχος αν η κράτηση είναι δική μου
    const currentUserId = req.userId; // Βεβαιώσου ότι το verifyToken το δίνει αυτό
    const isMine = activeReservation?.userId === currentUserId;

    const resEndTime = activeReservation
      ? activeReservation.expiresAt.toISOString().replace("T", " ").substring(0, 16)
      : null;

    const result = {
      pointid: charger.id,
      providerName: charger.providerName || "unknown",
      name: charger.name,
      address: charger.address ?? "",
      connectorType: charger.connectorType,
      lon: String(charger.lng),
      lat: String(charger.lat),
      status: getStatusString(charger.status), // Χρήση της getStatusString που έχουμε πάνω
      cap: charger.maxKW,
      kwhprice: charger.kwhprice,
      reservationendtime: resEndTime,
      reserved_by_me: isMine
    };

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json(makeErrorLog(req, 500, "Internal Error", err.message));
  }
});

export default router;