import { PrismaClient } from "../generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create owner account
  const ownerPassword = await bcrypt.hash("owner123321", 12);

  const owner = await prisma.user.upsert({
    where: { email: "liand@owner.com" },
    update: { password: ownerPassword },
    create: {
      email: "liand@owner.com",
      name: "Liand",
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
