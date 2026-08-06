const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const v = await prisma.visit.updateMany({
    data: { jobId: null, applicationNumber: null }
  });
  console.log('Unlinked visits:', v.count);

  const j = await prisma.job.deleteMany({});
  console.log('Deleted legacy jobs:', j.count);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
