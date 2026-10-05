import { defineConfig, env } from "prisma/config";

/*
 * Prisma 7 ย้าย connection string ออกจาก schema.prisma มาไว้ที่นี่
 * ใช้เฉพาะคำสั่งฝั่ง CLI (migrate / introspect) ส่วน runtime ใช้ driver adapter
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
});
