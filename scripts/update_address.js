const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.tenantSettings.updateMany({
    data: {
      baseAddress: 'Laprida 365, San Isidro',
    },
  });
  console.log('Updated tenant settings baseAddress:', updated.count);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
