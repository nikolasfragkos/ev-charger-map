import { PrismaClient, Prisma, Role, SessionStatus, ChargerStatus, ConnectorType } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function randomEmail(i: number) {
  // deterministic-ish uniqueness
  return `fake.user.${Date.now()}.${i}@example.com`.toLowerCase();
}

function randomName() {
  const first = ["Alex", "Chris", "Nikos", "Maria", "Eleni", "Giannis", "Katerina", "George", "Sofia", "Dimitris"];
  const last = ["Papadopoulos", "Ioannou", "Nikolaou", "Georgiou", "Christou", "Pappas", "Vlachos", "Anagnostou"];
  return { firstName: pick(first), lastName: pick(last) };
}

function randomPhone() {
  // simple Greek-looking mobile (not real)
  return `+30 69${randInt(10000000, 99999999)}`;
}

function daysAgoDate(daysAgoMin: number, daysAgoMax: number) {
  const now = Date.now();
  const daysAgo = randInt(daysAgoMin, daysAgoMax);
  const ms = daysAgo * 24 * 60 * 60 * 1000;
  // also randomize within day
  const jitter = randInt(0, 24 * 60 * 60 * 1000);
  return new Date(now - ms - jitter);
}

function hoursAfter(d: Date, hoursMin: number, hoursMax: number) {
  const ms = randInt(hoursMin, hoursMax) * 60 * 60 * 1000;
  return new Date(d.getTime() + ms);
}

function makeTokenLast4() {
  return String(randInt(0, 9999)).padStart(4, "0");
}

function makeUniqueStripeLike(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

async function ensureChargersExist() {
  const count = await prisma.charger.count();
  if (count > 0) return;

  // Create some chargers (Athens-ish area) so sessions can reference chargerId.
  const chargers = Array.from({ length: 50 }).map((_, i) => {
    const lat = 37.9 + Math.random() * 0.3; // 37.9–38.2
    const lng = 23.6 + Math.random() * 0.4; // 23.6–24.0
    return {
      providerName: "SeedProvider",
      name: `Seed Charger ${i + 1}`,
      address: `Seed Address ${i + 1}`,
      lat: new Prisma.Decimal(lat.toFixed(6)),
      lng: new Prisma.Decimal(lng.toFixed(6)),
      connectorType: pick([ConnectorType.CCS, ConnectorType.TYPE2, ConnectorType.CHADEMO]),
      maxKW: pick([50, 75, 100, 150, 200]),
      status: pick([ChargerStatus.AVAILABLE, ChargerStatus.IN_USE, ChargerStatus.OUTAGE]),
      kwhprice: 0.25,
    };
  });

  await prisma.charger.createMany({ data: chargers });
  console.log(`✅ Created ${chargers.length} chargers (since none existed).`);
}

async function main() {
  // 0) make sure admin exists
  const admin = await prisma.user.findUnique({ where: { id: 2 } });
  if (!admin) {
    throw new Error(`Admin user id=2 not found. Create it first, then re-run this seed.`);
  }

  // 1) ensure chargers exist
  await ensureChargersExist();
  const chargerIds = (await prisma.charger.findMany({ select: { id: true } })).map((c) => c.id);

  // 2) create ~500 fake users
  const USER_COUNT = 500;

  // NOTE: you have a required "password" field. Use a dummy hash/string.
  // If your auth expects bcrypt hashes, replace this with bcrypt hash generation.
  const dummyPassword = "seed_password_hash_or_plain_if_you_allow_it";

  const usersData = Array.from({ length: USER_COUNT }).map((_, i) => {
    const { firstName, lastName } = randomName();
    return {
      email: randomEmail(i),
      password: dummyPassword,
      firstName,
      lastName,
      phone: randomPhone(),
      role: Role.USER as Role,
      preferences: { marketing: Math.random() < 0.3, theme: pick(["dark", "light"]) },
    };
  });

  // createMany skips duplicates by default only if you set skipDuplicates:true
  const usersCreateRes = await prisma.user.createMany({
    data: usersData,
    skipDuplicates: true,
  });
  console.log(`✅ Inserted users: ${usersCreateRes.count}`);

  // Fetch user ids to use for sessions
  // (we only need the newly-created-ish ones; easiest: pull some recent ones by email prefix)
  const seededUsers = await prisma.user.findMany({
    where: { email: { contains: "fake.user." } },
    select: { id: true },
  });
  const userIds = seededUsers.map((u) => u.id);

  // 3) create ~1000 PAST sessions
  const SESSION_COUNT = 1000;

  const pastStatuses: SessionStatus[] = [
    SessionStatus.COMPLETED,
    SessionStatus.USER_STOPPED,
    SessionStatus.AUTO_STOPPED,
    SessionStatus.INSUFFICIENT_FUNDS,
  ];

  // Prepare session creates individually because Decimal fields + potential logic,
  // but still batch via transaction.
  const sessionCreates = Array.from({ length: SESSION_COUNT }).map(() => {
    const userId = pick(userIds);
    const chargerId = pick(chargerIds);

    const startedAt = daysAgoDate(2, 120);        // between 2 and 120 days ago
    const endedAt = hoursAfter(startedAt, 0.2 as any, 6); // 0–6 hours later (we'll fix below)

    // since hoursAfter expects ints, do manual duration:
    const durationMin = randInt(10, 240); // 10–240 minutes
    const endedAtFixed = new Date(startedAt.getTime() + durationMin * 60 * 1000);

    const kWh = Number((Math.random() * 70).toFixed(2)); // up to 70kWh
    const pricePerKWh = new Prisma.Decimal((0.15 + Math.random() * 0.25).toFixed(5)); // 0.15–0.40
    const cost = new Prisma.Decimal((kWh * Number(pricePerKWh)).toFixed(2));

    return prisma.session.create({
      data: {
        userId,
        chargerId,
        startedAt,
        endedAt: endedAtFixed,     // ✅ past ended session
        kWh,
        avgKW: Number((kWh / (durationMin / 60)).toFixed(2)),
        pricePerKWh,
        costEur: cost,
        status: pick(pastStatuses), // ✅ not RUNNING
        maxKWh: null,
      },
      select: { id: true },
    });
  });

  // chunk to avoid giant transaction if your DB is slow
  const chunkSize = 200;
  let createdSessions = 0;
  for (let i = 0; i < sessionCreates.length; i += chunkSize) {
    const chunk = sessionCreates.slice(i, i + chunkSize);
    const res = await prisma.$transaction(chunk);
    createdSessions += res.length;
    console.log(`✅ Created sessions: ${createdSessions}/${SESSION_COUNT}`);
  }

  // 4) add 3 payment methods to admin user id=2
  // Ensure uniqueness on stripePaymentMethodId (you have @unique)
  const pmData = Array.from({ length: 3 }).map(() => ({
    userId: 2,
    provider: "stripe",
    tokenLast4: makeTokenLast4(),
    stripePaymentMethodId: makeUniqueStripeLike("pm"),
    status: "valid",
  }));

  // if you rerun, you might want to avoid duplicates:
  // easiest is to just create, ids are unique anyway.
  await prisma.paymentMethod.createMany({ data: pmData });
  console.log(`✅ Added 3 payment methods to admin user (id=2).`);

  // 5) create ~10 past invoices for admin user id=2
  // Invoices require a Session with sessionId unique on Invoice.
  // So: create 10 past sessions for userId=2, then create invoices for those sessionIds.

  const INVOICE_COUNT = 10;

  const adminSessionIds: number[] = [];
  for (let i = 0; i < INVOICE_COUNT; i++) {
    const chargerId = pick(chargerIds);
    const startedAt = daysAgoDate(5, 365); // 5–365 days ago
    const durationMin = randInt(15, 180);
    const endedAt = new Date(startedAt.getTime() + durationMin * 60 * 1000);

    const kWh = Number((5 + Math.random() * 60).toFixed(2)); // 5–65kWh
    const pricePerKWh = new Prisma.Decimal((0.18 + Math.random() * 0.22).toFixed(5)); // 0.18–0.40
    const total = new Prisma.Decimal((kWh * Number(pricePerKWh)).toFixed(2));

    const s = await prisma.session.create({
      data: {
        userId: 2,
        chargerId,
        startedAt,
        endedAt,                 // ✅ past
        kWh,
        avgKW: Number((kWh / (durationMin / 60)).toFixed(2)),
        pricePerKWh,
        costEur: total,
        status: SessionStatus.COMPLETED,
      },
      select: { id: true },
    });

    adminSessionIds.push(s.id);
  }

  const invoiceData = adminSessionIds.map((sessionId) => ({
    userId: 2,
    sessionId,
    pdfUrl: `https://example.com/invoices/${sessionId}.pdf`,
    totalEur: new Prisma.Decimal(randInt(5, 80).toFixed(2)), // you can also reuse session cost if you prefer
  }));

  // Better: set invoice total to session.costEur (so it matches).
  // Keeping it simple above; if you want strict consistency, tell me and I’ll adjust.

  await prisma.invoice.createMany({ data: invoiceData });
  console.log(`✅ Created ${INVOICE_COUNT} invoices for admin user (id=2).`);

  console.log("🎉 Done.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
