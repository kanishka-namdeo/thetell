import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as pg from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@thetell.com' },
    select: { id: true, email: true, role: true, status: true, passwordHash: true },
  });
  
  console.log('Admin user:', user);

  if (!user) {
    console.log('Admin user does NOT exist. Creating...');
    const passwordHash = await bcrypt.hash('password123', 10);
    const created = await prisma.user.upsert({
      where: { email: 'admin@thetell.com' },
      update: {},
      create: {
        email: 'admin@thetell.com',
        name: 'Admin',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: new Date(),
      },
    });
    console.log('Created admin user:', created.id);
  } else {
    console.log('Admin user exists');
  }

  await prisma.$disconnect();
}

main().catch(e => { 
  console.error('Error:', e); 
  process.exit(1); 
});
