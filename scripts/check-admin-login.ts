import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = "postgresql://thell_user:thell_password@localhost:5433/the_tell";
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "admin@thetell.com" },
  });

  if (!user) {
    console.log("Admin user NOT FOUND");
    await prisma.$disconnect();
    return;
  }

  console.log("Email:", user.email);
  console.log("Role:", user.role);
  console.log("Status:", user.status);
  console.log("Login attempts:", user.loginAttempts);
  console.log("Lockout until:", user.lockoutUntil);
  console.log("Password hash exists:", !!user.passwordHash);
  console.log("Password hash (first 20 chars):", user.passwordHash?.slice(0, 20));
  console.log("Email verified:", user.emailVerified);

  const isValid = await bcrypt.compare("password123", user.passwordHash);
  console.log("Password 'password123' matches:", isValid);

  await prisma.$disconnect();
}

main();
