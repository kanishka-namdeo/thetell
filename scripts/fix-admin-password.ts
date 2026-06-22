import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  
  const admin = await prisma.user.upsert({
    where: { email: "admin@thetell.com" },
    update: { passwordHash },
    create: {
      email: "admin@thetell.com",
      name: "Admin User",
      passwordHash,
      role: "ADMIN" as any,
      emailVerified: new Date(),
    },
  });
  
  console.log("Admin user:", admin.email, admin.role);
  
  // Verify password works
  const isValid = await bcrypt.compare("password123", admin.passwordHash!);
  console.log("Password valid:", isValid);
}

main().catch(console.error).finally(() => prisma.$disconnect());
