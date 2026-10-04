import { Router } from "express";
import prisma from "../../prisma/client.ts";
import { verifyToken, requireAdmin } from "../../middleware/verifyToken.ts";
import { z } from "zod";

const router = Router();

const Query = z.object({
  q: z.string().optional(),                      // email search
  role: z.enum(["USER", "ADMIN"]).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  hasSessions: z.coerce.boolean().optional(),    // true|false
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(20),
  sort: z.enum(["createdAt","email"]).optional().default("createdAt"),
  order: z.enum(["asc","desc"]).optional().default("desc"),
});

type UserListItem = {
  id: number;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
  sessions: { id: number }[];
};

/**
 * GET /api/v1/admin/users
 * Filters:
 *  - q (email contains)
 *  - role (USER|ADMIN)
 *  - createdFrom, createdTo (ISO dates)
 *  - hasSessions (true|false)
 *  - page, pageSize (default 1,20; max 100)
 *  - sort (createdAt|email), order (asc|desc)
 */
router.get("/", async (req, res) => {
  try {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { q, role, createdFrom, createdTo, hasSessions, page, pageSize, sort, order } = parsed.data;

    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const where: any = {};

    if (q) {
      where.email = { contains: q, mode: "insensitive" };
    }
    if (role) where.role = role;
    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) where.createdAt.gte = createdFrom;
      if (createdTo) where.createdAt.lte = createdTo;
    }

    // hasSessions = true → at least one session
    // hasSessions = false → zero sessions
    if (hasSessions !== undefined) {
      where.sessions = hasSessions ? { some: {} } : { none: {} };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * safePageSize,
        take: safePageSize,
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // quick aggregates for the list
          sessions: { select: { id: true }, take: 1 }, // to infer hasSessions quickly
        },
      }),
    ]);

    // Add counts efficiently (optional)
    // For simplicity here, derive hasSessions from fetched relation length
    const items = users.map((u: UserListItem) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      hasSessions: u.sessions.length > 0,
    }));

    res.json({ items, page, pageSize: safePageSize, total });
  } catch (e) {
    console.error("GET /admin/users error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * (Optional) GET /api/v1/admin/users/:id
 * Detailed view for a single user (no password), with simple stats.
 */
router.get("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid user id" });

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        carOwnerships: { include: { car: { select: { id: true, brand: true, model: true, usableBatteryKWh: true, acMaxKW: true, dcMaxKW: true } } } },
      },
    });
    if (!user) return res.status(404).json({ error: "Not found" });

    const [sessionCount, totalKWh] = await Promise.all([
      prisma.session.count({ where: { userId: id } }),
      prisma.session.aggregate({ _sum: { kWh: true }, where: { userId: id } }),
    ]);

    res.json({
      user,
      stats: { sessions: sessionCount, totalKWh: totalKWh._sum.kWh ?? 0 },
    });
  } catch (e) {
    console.error("GET /admin/users/:id error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;