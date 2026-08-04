require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cutoffDate = new Date('2026-08-01T00:00:00.000Z');
  
  // Soft-delete transactions before August 1, 2026
  const deleted = await prisma.transaction.updateMany({
    where: {
      transactionDate: {
        lt: cutoffDate,
      },
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  console.log(`Cleaned up ${deleted.count} pre-August 2026 transactions.`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
