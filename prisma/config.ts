import path from "node:path";
import { defineConfig, env } from "prisma/config";
import { config } from "dotenv";

// Load .env.local for DATABASE_URL
config({ path: path.join(__dirname, "..", ".env.local") });

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
