import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONTRACTOR_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  await prisma.user.upsert({
    where: { id: CONTRACTOR_USER_ID },
    update: {},
    create: {
      id: CONTRACTOR_USER_ID,
      name: 'John Contractor',
      email: 'contractor@example.com',
      role: 'CONTRACTOR',
    },
  });

  console.log('Seed complete. Contractor email: contractor@example.com / password: mock123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
