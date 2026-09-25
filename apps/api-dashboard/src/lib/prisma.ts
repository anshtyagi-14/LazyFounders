import 'server-only';
import { PrismaClient } from '../generated/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };


export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Query logging only in development (never log queries/data in production).
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
