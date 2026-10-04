import express, { Request, Response } from "express";
import adminUsersRouter from "./adminUsers.ts";
import adminChargersRouter from "./adminChargers.ts";
import resetPointsRouter from "./resetPoints.ts";
import prisma from "../../prisma/client.ts";
import { makeErrorLog } from "../../middleware/errorHandler.ts";
import addPointsRouter from "./addPoints.ts";
import { verifyToken, requireAdmin } from "../../middleware/verifyToken.ts";
import pricingRouter from "./pricing.ts";

const router = express.Router();

// Protect all routes in this file
router.use(verifyToken, requireAdmin);

// --- Admin Users ---
router.use("/users", adminUsersRouter);

// --- Admin Pricing ---
router.use("/pricing" ,pricingRouter);

// --- Admin Chargers ---
router.use("/chargers", adminChargersRouter);

// --- Admin Reset Points ---
router.use("/", resetPointsRouter);  // mounts /resetpoints

// --- Admin Add Points ---
router.use("/", addPointsRouter);

// --- Admin Health Check ---
router.get("/healthcheck", async (req: Request, res: Response) => {
  try {
    const chargers = await prisma.charger.findMany({ select: { status: true } });

    const total = chargers.length;
    const online = chargers.filter(c =>
      ["AVAILABLE", "IN_USE"].includes(c.status)
    ).length;
    const offline = chargers.filter(c => c.status === "OUTAGE").length;

    res.status(200).json({
      status: "OK",
      dbconnection: process.env.DATABASE_URL || "postgresql://localhost:5432",
      n_charge_points: total,
      n_charge_points_online: online,
      n_charge_points_offline: offline,
    });
  } catch (err: any) {
    const errorLog = makeErrorLog(
      req,
      400,
      "Database connection or query failed",
      err.message
    );
    res.status(400).json(errorLog);
  }
});

export default router;