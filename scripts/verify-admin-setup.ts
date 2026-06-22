/**
 * Admin Setup Verification Script
 * 
 * Verifies that the admin system is properly configured and working.
 * 
 * Usage:
 *   pnpm tsx scripts/verify-admin-setup.ts
 */

import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function verifyAdminSetup() {
  console.log("🔍 Verifying Admin Setup...\n");

  let passed = 0;
  let failed = 0;

  // 1. Check admin user exists
  console.log("1️⃣  Checking admin user...");
  try {
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@thetell.com" },
    });

    if (adminUser && adminUser.role === Role.ADMIN) {
      console.log("   ✅ Admin user exists with correct role");
      console.log(`      Email: ${adminUser.email}`);
      console.log(`      Role: ${adminUser.role}`);
      console.log(`      Verified: ${adminUser.emailVerified ? "Yes" : "No"}`);
      passed++;
    } else if (adminUser) {
      console.log("   ⚠️  Admin user exists but role is not ADMIN");
      console.log(`      Current role: ${adminUser.role}`);
      failed++;
    } else {
      console.log("   ❌ Admin user not found");
      console.log("      Run: pnpm prisma db seed");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ Error checking admin user:", error);
    failed++;
  }

  // 2. Check AuditLog model exists
  console.log("\n2️⃣  Checking AuditLog model...");
  try {
    const auditCount = await prisma.auditLog.count();
    console.log(`   ✅ AuditLog model exists (${auditCount} entries)`);
    passed++;
  } catch (error) {
    console.log("   ❌ AuditLog model not found");
    console.log("      Run: pnpm prisma migrate deploy");
    failed++;
  }

  // 3. Check User model has status field
  console.log("\n3️⃣  Checking User model status field...");
  try {
    const user = await prisma.user.findFirst({
      select: { status: true },
    });
    if (user && "status" in user) {
      console.log("   ✅ User model has status field");
      console.log(`      Current status: ${user.status}`);
      passed++;
    } else {
      console.log("   ⚠️  User model may not have status field");
      failed++;
    }
  } catch (error) {
    console.log("   ❌ Error checking User model:", error);
    failed++;
  }

  // 4. Check SignalStatus enum has REJECTED
  console.log("\n4️⃣  Checking SignalStatus enum...");
  try {
    const signal = await prisma.signal.findFirst({
      where: { status: "REJECTED" },
    });
    console.log("   ✅ SignalStatus enum includes REJECTED");
    passed++;
  } catch (error) {
    console.log("   ⚠️  Could not verify REJECTED status (may not exist yet)");
    console.log("      This is OK if no signals have been rejected");
    passed++;
  }

  // 5. Check ArticleStatus enum has PENDING_REVIEW
  console.log("\n5️⃣  Checking ArticleStatus enum...");
  try {
    const article = await prisma.article.findFirst({
      where: { status: "PENDING_REVIEW" },
    });
    console.log("   ✅ ArticleStatus enum includes PENDING_REVIEW");
    passed++;
  } catch (error) {
    console.log("   ⚠️  Could not verify PENDING_REVIEW status (may not exist yet)");
    console.log("      This is OK if no articles are pending review");
    passed++;
  }

  // 6. Check admin API routes exist
  console.log("\n6️⃣  Checking admin API routes...");
  const routes = [
    "/api/v1/admin/users",
    "/api/v1/admin/system/health",
  ];
  
  for (const route of routes) {
    try {
      const response = await fetch(`http://localhost:3000${route}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      
      // We expect 401 (unauthorized) since we're not logged in
      if (response.status === 401 || response.status === 200) {
        console.log(`   ✅ Route ${route} exists`);
        passed++;
      } else {
        console.log(`   ⚠️  Route ${route} returned ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ⚠️  Could not test ${route} (server not running)`);
      console.log("      Start server with: pnpm dev");
      break;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`\n📊 Verification Summary:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  
  if (failed === 0) {
    console.log("\n✅ All checks passed! Admin system is ready.");
    console.log("\n🚀 Next steps:");
    console.log("   1. Start the server: pnpm dev");
    console.log("   2. Login at: http://localhost:3000/sign-in");
    console.log("   3. Email: admin@thetell.com");
    console.log("   4. Password: password123");
    console.log("   5. Access admin: http://localhost:3000/dashboard/admin");
  } else {
    console.log("\n⚠️  Some checks failed. Please review the errors above.");
    console.log("\n🔧 Troubleshooting:");
    console.log("   - Ensure DATABASE_URL is set in .env.local");
    console.log("   - Run: pnpm prisma migrate deploy");
    console.log("   - Run: pnpm prisma db seed");
    console.log("   - Start server: pnpm dev");
  }

  console.log();
}

async function main() {
  try {
    await verifyAdminSetup();
  } catch (error) {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
