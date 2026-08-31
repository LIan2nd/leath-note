import "dotenv/config";
import { defineConfig } from "prisma/config";

// A separate direct connection is required for hosted poolers such as
// Supabase. Local PostgreSQL does not need one, so keep local setup backwards
// compatible by reusing DATABASE_URL when DIRECT_URL is omitted.
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
