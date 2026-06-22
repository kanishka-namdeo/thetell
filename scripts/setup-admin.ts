/**
 * Admin User Setup Script
 * 
 * Creates or updates an admin user in the database.
 * 
 * Usage:
 *   pnpm tsx scripts/setup-admin.ts
 *   pnpm tsx scripts/setup-admin.ts --email admin@example.com --password securepass123
 *   pnpm tsx scripts/setup-admin.ts --reset  # Reset to default credentials
 */

import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import readline from "readline";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const DEFAULT_ADMIN = {
  email: "admin@thetell.com",
  password: "password123",
  name: "Admin User",
};

interface CliArgs {
  email?: string;
  password?: string;
  name?: string;
  reset?: boolean;
  help?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email" && argv[i + 1]) {
      args.email = argv[++i];
    } else if (arg === "--password" && argv[i + 1]) {
      args.password = argv[++i];
    } else if (arg === "--name" && argv[i + 1]) {
      args.name = argv[++i];
    } else if (arg === "--reset") {
      args.reset = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Admin User Setup Script

Usage:
  pnpm tsx scripts/setup-admin.ts [options]

Options:
  --email <email>       Admin email address (default: ${DEFAULT_ADMIN.email})
  --password <password> Admin password (default: ${DEFAULT_ADMIN.password})
  --name <name>         Admin display name (default: ${DEFAULT_ADMIN.name})
  --reset               Reset to default credentials
  --help, -h            Show this help message

Examples:
  # Create admin with default credentials
  pnpm tsx scripts/setup-admin.ts

  # Create admin with custom credentials
  pnpm tsx scripts/setup-admin.ts --email admin@example.com --password securepass123

  # Reset to default credentials
  pnpm tsx scripts/setup-admin.ts --reset

Default Credentials:
  Email:    ${DEFAULT_ADMIN.email}
  Password: ${DEFAULT_ADMIN.password}
  Name:     ${DEFAULT_ADMIN.name}
`);
}

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function setupAdmin(args: CliArgs) {
  console.log("🔐 Admin User Setup\n");

  const email = args.email || DEFAULT_ADMIN.email;
  const password = args.password || DEFAULT_ADMIN.password;
  const name = args.name || DEFAULT_ADMIN.name;

  // Validate password strength
  if (password.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long");
    process.exit(1);
  }

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log(`⚠️  User with email ${email} already exists`);
    console.log(`    Current role: ${existingAdmin.role}`);
    console.log(`    Created: ${existingAdmin.createdAt.toISOString()}`);

    if (args.reset) {
      const confirmed = await promptConfirmation(
        "\n⚠️  This will update the existing user's password and role to ADMIN. Continue?"
      );
      if (!confirmed) {
        console.log("❌ Operation cancelled");
        process.exit(0);
      }
    } else {
      const confirmed = await promptConfirmation(
        "\n⚠️  Update this user to ADMIN role? (This will not change the password)"
      );
      if (!confirmed) {
        console.log("❌ Operation cancelled");
        process.exit(0);
      }

      // Just update role
      await prisma.user.update({
        where: { email },
        data: { role: Role.ADMIN },
      });

      console.log("\n✅ User updated to ADMIN role");
      console.log(`   Email: ${email}`);
      console.log(`   Role: ADMIN\n`);
      return;
    }
  }

  // Create or update admin user
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: Role.ADMIN,
      emailVerified: new Date(),
    },
    create: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
      emailVerified: new Date(),
    },
  });

  console.log("\n✅ Admin user created/updated successfully\n");
  console.log("📋 Credentials:");
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Name:     ${admin.name}`);
  console.log(`   Role:     ${admin.role}`);
  console.log(`   ID:       ${admin.id}`);
  console.log(`   Verified: ${admin.emailVerified?.toISOString()}\n`);

  console.log("🔐 Security Notice:");
  console.log("   - Change these credentials before production deployment");
  console.log("   - Use a strong, unique password");
  console.log("   - Store credentials securely (password manager, secrets vault)");
  console.log("   - Never commit credentials to version control\n");

  console.log("🚀 Next Steps:");
  console.log("   1. Start the development server: pnpm dev");
  console.log("   2. Navigate to: http://localhost:3000/sign-in");
  console.log("   3. Login with the credentials above");
  console.log("   4. Access admin panel at: http://localhost:3000/dashboard/admin\n");
}

async function main() {
  try {
    const args = parseArgs();

    if (args.help) {
      showHelp();
      process.exit(0);
    }

    await setupAdmin(args);
  } catch (error) {
    console.error("\n❌ Error setting up admin user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
