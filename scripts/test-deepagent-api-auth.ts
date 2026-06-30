import { prisma } from "../src/lib/db";

async function testDeepAgentAPIWithAuth() {
  console.log("=== DeepAgent API Test Suite ===\n");

  const adminCredentials = {
    email: "admin@thetell.com",
    password: "password123",
  };

  const analystCredentials = {
    email: "analyst@thetell.com",
    password: "password123",
  };

  let adminCookies: string[] = [];
  let analystCookies: string[] = [];
  let testSessionId: string | null = null;

  function extractCookies(response: Response): string[] {
    const cookies: string[] = [];
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    console.log(`  Raw set-cookie headers: ${setCookieHeaders.length}`);
    for (const header of setCookieHeaders) {
      const match = header.match(/^([^=]+=[^;]+)/);
      if (match) {
        cookies.push(match[1]);
        console.log(`  Extracted: ${match[1].substring(0, 30)}...`);
      }
    }
    return cookies;
  }

  function cookieString(cookies: string[]): string {
    return cookies.join("; ");
  }

  try {
    // Step 1: Get CSRF token and cookies
    console.log("Step 1: Get CSRF token");
    const csrfResponse = await fetch("http://localhost:3000/api/auth/csrf", {
      method: "GET",
    });
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.csrfToken;
    const csrfCookies = extractCookies(csrfResponse);
    console.log(`✓ CSRF token: ${csrfToken.substring(0, 10)}...`);
    console.log(`✓ CSRF cookies: ${csrfCookies.length} extracted\n`);

    // Step 2: Login as admin
    console.log("Step 2: Login as admin");
    const loginFormData = new URLSearchParams({
      csrfToken,
      email: adminCredentials.email,
      password: adminCredentials.password,
      json: "true",
    });

    console.log(`  Sending login request...`);
    const adminLoginResponse = await fetch(
      "http://localhost:3000/api/auth/callback/credentials",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieString(csrfCookies),
        },
        body: loginFormData.toString(),
        redirect: "manual",
      }
    );

    console.log(`  Login response status: ${adminLoginResponse.status}`);
    console.log(`  Login response location: ${adminLoginResponse.headers.get("location")}`);
    
    const loginCookies = extractCookies(adminLoginResponse);
    console.log(`  Login cookies extracted: ${loginCookies.length}`);

    // Combine CSRF cookies with session cookies
    adminCookies = [...csrfCookies, ...loginCookies];
    console.log(`✓ Total admin cookies: ${adminCookies.length}\n`);

    // Step 3: Verify admin session
    console.log("Step 3: Verify admin session");
    const sessionCheckResponse = await fetch(
      "http://localhost:3000/api/auth/session",
      {
        headers: {
          Cookie: cookieString(adminCookies),
        },
      }
    );
    const sessionText = await sessionCheckResponse.text();
    console.log(`  Session response: ${sessionText.substring(0, 100)}...`);
    
    let sessionData;
    try {
      sessionData = JSON.parse(sessionText);
    } catch {
      console.log(`✗ Failed to parse session response`);
      return;
    }

    if (sessionData?.user) {
      console.log(`✓ Admin user: ${sessionData.user.email}`);
      console.log(`✓ Admin role: ${sessionData.user.role}\n`);
    } else {
      console.log(`✗ No user in session data\n`);
      return;
    }

    // Step 4: Test POST /api/v1/admin/deepagent/sessions
    console.log("Step 4: POST /api/v1/admin/deepagent/sessions");
    const createSessionResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/sessions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString(adminCookies),
        },
        body: JSON.stringify({ title: "API Test Session" }),
      }
    );
    console.log(`Status: ${createSessionResponse.status}`);
    if (createSessionResponse.ok) {
      const sessionData = await createSessionResponse.json();
      testSessionId = sessionData.data.id;
      console.log(`✓ Created session: ${testSessionId}`);
      console.log(`  Title: ${sessionData.data.title}`);
      console.log(`  Status: ${sessionData.data.status}`);
      console.log(`  Message count: ${sessionData.data.messageCount}\n`);
    } else {
      const errText = await createSessionResponse.text();
      console.log(`✗ Failed: ${errText}\n`);
      return;
    }

    // Step 5: Test GET /api/v1/admin/deepagent/sessions
    console.log("Step 5: GET /api/v1/admin/deepagent/sessions");
    const listSessionsResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/sessions",
      {
        method: "GET",
        headers: {
          Cookie: cookieString(adminCookies),
        },
      }
    );
    console.log(`Status: ${listSessionsResponse.status}`);
    if (listSessionsResponse.ok) {
      const sessionsData = await listSessionsResponse.json();
      console.log(`✓ Found ${sessionsData.data.length} sessions`);
      sessionsData.data.forEach((s: any) => {
        console.log(`  - ${s.id}: ${s.title} (${s.messageCount} messages)`);
      });
      console.log();
    } else {
      console.log(`✗ Failed: ${await listSessionsResponse.text()}\n`);
    }

    // Step 6: Test GET messages (empty)
    console.log(`Step 6: GET /api/v1/admin/deepagent/sessions/${testSessionId}/messages`);
    const messagesResponse = await fetch(
      `http://localhost:3000/api/v1/admin/deepagent/sessions/${testSessionId}/messages`,
      {
        method: "GET",
        headers: {
          Cookie: cookieString(adminCookies),
        },
      }
    );
    console.log(`Status: ${messagesResponse.status}`);
    if (messagesResponse.ok) {
      const messagesData = await messagesResponse.json();
      console.log(`✓ Found ${messagesData.data.length} messages\n`);
    } else {
      console.log(`✗ Failed: ${await messagesResponse.text()}\n`);
    }

    // Step 7: Test POST /api/v1/admin/deepagent/chat
    console.log("Step 7: POST /api/v1/admin/deepagent/chat");
    const chatResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieString(adminCookies),
        },
        body: JSON.stringify({
          sessionId: testSessionId,
          message: "Hello, this is a test message",
        }),
      }
    );
    console.log(`Status: ${chatResponse.status}`);
    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      console.log(`✓ Message sent`);
      console.log(`  User message ID: ${chatData.data?.userMessageId}`);
      console.log(`  Assistant message ID: ${chatData.data?.assistantMessageId}\n`);
    } else {
      console.log(`✗ Failed: ${await chatResponse.text()}\n`);
    }

    // Step 8: Verify messages in DB
    console.log("Step 8: Verify messages via API");
    const verifyMessagesResponse = await fetch(
      `http://localhost:3000/api/v1/admin/deepagent/sessions/${testSessionId}/messages`,
      {
        method: "GET",
        headers: {
          Cookie: cookieString(adminCookies),
        },
      }
    );
    if (verifyMessagesResponse.ok) {
      const verifyData = await verifyMessagesResponse.json();
      console.log(`✓ Found ${verifyData.data.length} messages`);
      verifyData.data.forEach((m: any) => {
        console.log(`  - [${m.role}]: ${m.content.substring(0, 60)}...`);
      });
      console.log();
    }

    // Step 9: Test unauthorized access
    console.log("Step 9: Test unauthorized access (no cookies)");
    const unauthorizedResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/sessions",
      { method: "GET" }
    );
    console.log(`Status: ${unauthorizedResponse.status}`);
    if (unauthorizedResponse.status === 401) {
      console.log(`✓ Correctly rejected unauthorized request\n`);
    } else {
      console.log(`⚠ Expected 401, got ${unauthorizedResponse.status}\n`);
    }

    // Step 10: Login as analyst
    console.log("Step 10: Login as analyst (non-admin)");
    const analystLoginResponse = await fetch(
      "http://localhost:3000/api/auth/callback/credentials",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieString(csrfCookies),
        },
        body: new URLSearchParams({
          csrfToken,
          email: analystCredentials.email,
          password: analystCredentials.password,
          json: "true",
        }),
        redirect: "manual",
      }
    );
    const analystLoginCookies = extractCookies(analystLoginResponse);
    analystCookies = [...csrfCookies, ...analystLoginCookies];

    // Verify analyst session
    const analystSessionCheck = await fetch(
      "http://localhost:3000/api/auth/session",
      { headers: { Cookie: cookieString(analystCookies) } }
    );
    const analystSessionData = await analystSessionCheck.json();
    console.log(`✓ Analyst user: ${analystSessionData.user?.email}`);
    console.log(`✓ Analyst role: ${analystSessionData.user?.role}\n`);

    // Step 11: Test forbidden access
    console.log("Step 11: Test forbidden access (analyst -> admin endpoint)");
    const forbiddenResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/sessions",
      {
        method: "GET",
        headers: { Cookie: cookieString(analystCookies) },
      }
    );
    console.log(`Status: ${forbiddenResponse.status}`);
    if (forbiddenResponse.status === 403) {
      console.log(`✓ Correctly rejected non-admin user\n`);
    } else {
      console.log(`⚠ Expected 403, got ${forbiddenResponse.status}\n`);
    }

    // Step 12: Test invalid session ID
    console.log("Step 12: Test invalid session ID");
    const invalidSessionResponse = await fetch(
      "http://localhost:3000/api/v1/admin/deepagent/sessions/invalid-session-id/messages",
      {
        method: "GET",
        headers: { Cookie: cookieString(adminCookies) },
      }
    );
    console.log(`Status: ${invalidSessionResponse.status}`);
    if (
      invalidSessionResponse.status === 404 ||
      invalidSessionResponse.status === 403
    ) {
      console.log(`✓ Correctly rejected invalid session ID\n`);
    } else {
      console.log(
        `⚠ Expected 404 or 403, got ${invalidSessionResponse.status}\n`
      );
    }

    // Step 13: Test streaming endpoint
    console.log("Step 13: Test GET /api/v1/admin/deepagent/stream");
    const streamResponse = await fetch(
      `http://localhost:3000/api/v1/admin/deepagent/stream?sessionId=${testSessionId}`,
      {
        method: "GET",
        headers: {
          Cookie: cookieString(adminCookies),
          Accept: "text/event-stream",
        },
      }
    );
    console.log(`Status: ${streamResponse.status}`);
    console.log(`Content-Type: ${streamResponse.headers.get("content-type")}`);
    console.log(`Cache-Control: ${streamResponse.headers.get("cache-control")}`);
    if (streamResponse.ok) {
      console.log(`✓ Stream endpoint responded OK`);
      // Read a bit of the stream
      const reader = streamResponse.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        if (value) {
          const text = new TextDecoder().decode(value);
          console.log(`✓ Stream data received: ${text.substring(0, 200)}`);
        }
        reader.cancel();
      }
      console.log();
    } else {
      console.log(`✗ Failed: ${await streamResponse.text()}\n`);
    }

    // Step 14: Test DELETE session
    console.log(`Step 14: DELETE /api/v1/admin/deepagent/sessions/${testSessionId}`);
    const deleteSessionResponse = await fetch(
      `http://localhost:3000/api/v1/admin/deepagent/sessions/${testSessionId}`,
      {
        method: "DELETE",
        headers: { Cookie: cookieString(adminCookies) },
      }
    );
    console.log(`Status: ${deleteSessionResponse.status}`);
    if (deleteSessionResponse.ok) {
      const deleteData = await deleteSessionResponse.json();
      console.log(`✓ Session deleted: ${JSON.stringify(deleteData)}\n`);
    } else {
      console.log(`✗ Failed: ${await deleteSessionResponse.text()}\n`);
    }

    // Step 15: Verify session was deleted
    console.log("Step 15: Verify session was deleted");
    const verifyDeleteResponse = await fetch(
      `http://localhost:3000/api/v1/admin/deepagent/sessions/${testSessionId}/messages`,
      {
        method: "GET",
        headers: { Cookie: cookieString(adminCookies) },
      }
    );
    console.log(`Status: ${verifyDeleteResponse.status}`);
    if (
      verifyDeleteResponse.status === 404 ||
      verifyDeleteResponse.status === 403
    ) {
      console.log(`✓ Session correctly deleted (not found/forbidden)\n`);
    } else {
      console.log(`⚠ Expected 404 or 403, got ${verifyDeleteResponse.status}\n`);
    }

    // Step 16: Check audit logs
    console.log("Step 16: Check audit logs");
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ["deepagent.session.created", "deepagent.session.deleted"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    console.log(`✓ Found ${auditLogs.length} DeepAgent audit logs`);
    auditLogs.forEach((log) => {
      console.log(
        `  - ${log.action} | resource: ${log.resourceId} | ${log.createdAt.toISOString()}`
      );
    });
    console.log();

    // Step 17: Database verification
    console.log("Step 17: Database verification");
    const remainingSessions = await prisma.deepAgentSession.count({
      where: { userId: sessionData.user.id },
    });
    console.log(`✓ Remaining sessions for admin: ${remainingSessions}`);

    const allMessages = await prisma.deepAgentMessage.count();
    console.log(`✓ Total messages in DB: ${allMessages}`);

    console.log("\n=== All API tests completed ===");
  } catch (error) {
    console.error("\n✗ Test failed:", error);
  }
}

testDeepAgentAPIWithAuth();
