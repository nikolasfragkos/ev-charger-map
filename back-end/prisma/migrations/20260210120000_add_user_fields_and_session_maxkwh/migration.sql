-- Add missing columns introduced in schema after initial migration.

ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

ALTER TABLE "Reservation" ADD COLUMN "paymentIntentId" TEXT;

ALTER TABLE "Session" ADD COLUMN "maxKWh" DOUBLE PRECISION;
