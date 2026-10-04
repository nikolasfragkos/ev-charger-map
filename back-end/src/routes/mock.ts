import express, { Request, Response } from "express";
import { Prisma, SessionStatus } from "@prisma/client";
import prisma from "../prisma/client.ts";
import stripe from "../services/stripe.ts";
import { verifyToken } from "../middleware/verifyToken.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { chargeSession } from "../controllers/paymentController.ts";

const router = express.Router();

const isMockEnabled = () => process.env.ENABLE_MOCK_SESSION === "1";
const fallbackChargerId = () => Number(process.env.MOCK_DEFAULT_CHARGER_ID ?? 1);
const fallbackAmount = () => Number(process.env.MOCK_DEFAULT_AMOUNT_EUR ?? 3.75);
const fallbackEnergy = () => Number(process.env.MOCK_DEFAULT_KWH ?? 12.34);
const fallbackDurationMinutes = () => Number(process.env.MOCK_DEFAULT_DURATION_MIN ?? 60);

async function ensureStripeCustomer(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({ metadata: { appUserId: String(userId) } });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

async function ensurePaymentMethod(userId: number, customerId: string) {
  const existing = await prisma.paymentMethod.findFirst({
    where: {
      userId,
      provider: "stripe",
      status: "valid",
      stripePaymentMethodId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing?.stripePaymentMethodId) return existing.stripePaymentMethodId;

  const token = process.env.MOCK_STRIPE_TOKEN ?? "tok_visa";

  const pm = await stripe.paymentMethods.create({
    type: "card",
    card: { token },
  });

  await stripe.paymentMethods.attach(pm.id, { customer: customerId });

  await prisma.paymentMethod.create({
    data: {
      userId,
      provider: "stripe",
      tokenLast4: pm.card?.last4 ?? "4242",
      stripePaymentMethodId: pm.id,
      status: "valid",
    },
  });

  return pm.id;
}

router.post("/session", verifyToken, async (req: Request, res: Response) => {
  if (!isMockEnabled()) {
    return res.status(404).json(makeErrorLog(req, 404, "Not found"));
  }

  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json(makeErrorLog(req, 401, "Unauthorized"));
    }

    const { chargerId: rawChargerId, amountEur: rawAmount, kWh: rawKWh, durationMinutes: rawDuration } =
      (req.body as Record<string, unknown>) ?? {};

    const chargerId = Number(rawChargerId ?? fallbackChargerId());
    const amountEur = Number(rawAmount ?? fallbackAmount());
    const energyKWh = Number(rawKWh ?? fallbackEnergy());
    const durationMinutes = Number(rawDuration ?? fallbackDurationMinutes());

    if (!Number.isFinite(chargerId) || chargerId <= 0) {
      return res.status(400).json(makeErrorLog(req, 400, "Invalid chargerId"));
    }
    if (!Number.isFinite(amountEur) || amountEur <= 0) {
      return res.status(400).json(makeErrorLog(req, 400, "Invalid amountEur"));
    }
    if (!Number.isFinite(energyKWh) || energyKWh <= 0) {
      return res.status(400).json(makeErrorLog(req, 400, "Invalid kWh value"));
    }

    const charger = await prisma.charger.findUnique({ where: { id: chargerId } });
    if (!charger) {
      return res.status(404).json(makeErrorLog(req, 404, "Charger not found"));
    }

    const customerId = await ensureStripeCustomer(userId);
    await ensurePaymentMethod(userId, customerId);

    const sessionMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - sessionMinutes * 60 * 1000);
    const pricePerKWh = amountEur / energyKWh;

    const session = await prisma.session.create({
      data: {
        userId,
        chargerId,
        startedAt: startTime,
        endedAt: endTime,
        kWh: energyKWh,
        pricePerKWh: new Prisma.Decimal(pricePerKWh),
        costEur: new Prisma.Decimal(amountEur),
        status: SessionStatus.COMPLETED,
      },
    });

    const intent = await chargeSession(session.id, amountEur, userId);

    const paymentAuth = await prisma.paymentAuth.findUnique({
      where: { sessionId: session.id },
      include: {
        session: { include: { invoice: true, charger: true } },
      },
    });

    return res.status(201).json({
      sessionId: session.id,
      charger: { id: charger.id, name: charger.name ?? `Charger #${charger.id}` },
      paymentIntentId: intent.id,
      paymentStatus: intent.status,
      amountEur,
      energyKWh,
      paymentAuth,
    });
  } catch (err: any) {
    console.error("Mock session failed", err);
    const msg = typeof err?.message === "string" ? err.message : "Unable to create mock session";
    return res.status(500).json(makeErrorLog(req, 500, msg));
  }
});

export default router;
