/**
 * Seed the Acme SaaS database with sample data.
 *
 * Run: npx ts-node prisma/seed.ts
 *   or: npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create an organization
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'PRO',
    },
  });

  // Create a user
  const user = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@acme.com',
    },
  });

  // Add user as owner of org
  await prisma.member.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      userId: user.id,
      role: 'OWNER',
    },
  });

  // Create a project
  await prisma.project.upsert({
    where: { id: 'seed-project' },
    update: {},
    create: {
      id: 'seed-project',
      organizationId: org.id,
      name: 'Default Project',
      description: 'Auto-created by seed script',
    },
  });

  console.log('✅ Seed complete: org, user, member, project');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
