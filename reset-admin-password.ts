import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as pg from "pg";
import bcrypt from "bcryptjs";

const connectionString = "postgresql://thell_user:thell_password@localhost:5433/the_tell";
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "admin@thetell.com";
  const password = "password123";
  
  const hash = await bcrypt.hash(password, 10);
  
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash: hash },
  });
  
  console.log(`Password reset for ${user.email}`);
  console.log(`New password: ${password}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
