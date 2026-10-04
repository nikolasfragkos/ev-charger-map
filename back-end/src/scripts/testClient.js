import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

console.log(Object.keys(prisma)); // list model accessors
await prisma.$disconnect();