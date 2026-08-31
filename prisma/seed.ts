import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPasswordValue = process.env.SEED_OWNER_PASSWORD;

  if (!ownerEmail || !ownerPasswordValue || ownerPasswordValue.length < 12) {
    throw new Error(
      "Set SEED_OWNER_EMAIL and a SEED_OWNER_PASSWORD of at least 12 characters before seeding.",
    );
  }

  // Create owner account
  const ownerPassword = await bcrypt.hash(ownerPasswordValue, 12);

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { password: ownerPassword },
    create: {
      email: ownerEmail,
      name: process.env.SEED_OWNER_NAME?.trim() || "Owner",
      password: ownerPassword,
    },
  });

  console.log(`Owner account ready: ${owner.id} (${owner.email})`);

  // Assign all orphaned notes to the owner
  const result = await prisma.$executeRaw`UPDATE "Note" SET "userId" = ${owner.id} WHERE "userId" IS NULL`;

  if (result > 0) {
    console.log(`Assigned ${result} orphaned notes to owner`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
