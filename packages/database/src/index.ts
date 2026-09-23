import { PrismaClient, Prisma } from '@prisma/client';

export { PrismaClient, Prisma };
export type * from '@prisma/client';

/** Transaction client handed to callbacks of `prisma.$transaction(async (tx) => ...)`. */
export type Tx = Prisma.TransactionClient;
/** Anything that can run queries: the root client or a transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

let shared: PrismaClient | undefined;

/** Process-wide Prisma client. Services that already own a client should keep using it. */
export function getPrisma(): PrismaClient {
  if (!shared) shared = new PrismaClient();
  return shared;
}
