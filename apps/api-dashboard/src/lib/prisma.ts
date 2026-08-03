import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

if (process.env.NODE_ENV !== 'production' && globalForPrisma.prisma) {
  // Bust cache to pick up new ApiKey model
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
