import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ev.local' },
    update: {},
    create: { email: 'admin@ev.local', password, role: 'ADMIN' },
  });

  const profile = await prisma.pricingProfile.upsert({
    where: { name: 'Default' },
    update: {},
    create: { name: 'Default', rulesJson: { base: 0.20, tod: [{ from: 18, to: 23, adj: 0.05 }], wholesaleMultiplier: 0.3 } },
  });

  await prisma.charger.createMany({
    data: [
      { name: 'NTUA Gate', address: 'Iroon Polytechniou 9', lat: 37.978900, lng: 23.783800, connectorType: 'CCS', maxKW: 150, pricingProfileId: profile.id },
      { name: 'Coastal Mall', address: 'Leof. Posidonos 2', lat: 37.939000, lng: 23.646500, connectorType: 'CHADEMO', maxKW: 50, pricingProfileId: profile.id },
    ],
    skipDuplicates: true,
  });

  console.log('Seed done. Admin:', admin.email);
}

main().finally(() => prisma.$disconnect());