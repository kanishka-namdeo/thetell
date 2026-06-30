import { prisma } from "../src/lib/db";

async function testDeepAgentAPI() {
  console.log("=== DeepAgent API Test Suite ===\n");

  const adminUserId = "cmqja9ou20000vgln1mxqpd6y"; // admin@thetell.com
  let testSessionId: string | null = null;

  try {
    // Test 1: Create a session
    console.log("Test 1: POST /api/v1/admin/deepagent/sessions");
    const createResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/sessions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `next-auth.session-token=test`, // Will fail auth, but testing Prisma
        },
        body: JSON.stringify({ title: "Test Session" }),
      }
    );
    console.log(`Status: ${createResponse.status}`);
    if (createResponse.ok) {
      const data = await createResponse.json();
      testSessionId = data.id;
      console.log(`✓ Created session: ${testSessionId}`);
    } else {
      console.log(`✗ Failed: ${await createResponse.text()}`);
    }

    // Test 2: List sessions (direct DB test)
    console.log("\nTest 2: Direct DB query - prisma.deepAgentSession.findMany");
    const sessions = await prisma.deepAgentSession.findMany({
      where: { userId: adminUserId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
    console.log(`✓ Found ${sessions.length} sessions`);
    if (sessions.length > 0) {
      console.log(`  First session: ${sessions[0].id} - ${sessions[0].title}`);
    }

    // Test 3: Create session via DB
    console.log("\nTest 3: Direct DB create - prisma.deepAgentSession.create");
    const newSession = await prisma.deepAgentSession.create({
      data: {
        userId: adminUserId,
        title: "DB Test Session",
        status: "idle",
      },
    });
    console.log(`✓ Created session: ${newSession.id}`);
    testSessionId = newSession.id;

    // Test 4: Create a message
    console.log("\nTest 4: Direct DB create - prisma.deepAgentMessage.create");
    const message = await prisma.deepAgentMessage.create({
      data: {
        sessionId: testSessionId,
        role: "user",
        content: "Hello, this is a test message",
      },
    });
    console.log(`✓ Created message: ${message.id}`);

    // Test 5: Query messages
    console.log("\nTest 5: Direct DB query - prisma.deepAgentMessage.findMany");
    const messages = await prisma.deepAgentMessage.findMany({
      where: { sessionId: testSessionId },
      orderBy: { timestamp: "asc" },
    });
    console.log(`✓ Found ${messages.length} messages`);
    messages.forEach((m) => {
      console.log(`  - ${m.role}: ${m.content.substring(0, 50)}...`);
    });

    // Test 6: Update session status
    console.log("\nTest 6: Direct DB update - session status");
    const updated = await prisma.deepAgentSession.update({
      where: { id: testSessionId },
      data: { status: "running" },
    });
    console.log(`✓ Updated status: ${updated.status}`);

    // Test 7: Delete session (cascade)
    console.log("\nTest 7: Direct DB delete - cascade test");
    await prisma.deepAgentSession.delete({
      where: { id: testSessionId },
    });
    console.log(`✓ Deleted session: ${testSessionId}`);

    // Verify cascade
    const remainingMessages = await prisma.deepAgentMessage.findMany({
      where: { sessionId: testSessionId },
    });
    console.log(
      `✓ Cascade delete: ${remainingMessages.length} messages remaining (should be 0)`
    );

    console.log("\n=== All DB tests passed ===");
  } catch (error) {
    console.error("\n✗ Test failed:", error);
  }
}

testDeepAgentAPI();
