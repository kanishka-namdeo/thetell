import "dotenv/config";

async function main() {
  const adminEmail = "admin@thetell.com";
  const adminPassword = "password123";

  console.log("1. Logging in as admin...");

  // Sign in
  const signInRes = await fetch("http://localhost:3000/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
      redirect: false,
    }),
  });

  if (!signInRes.ok) {
    console.error("Sign-in failed:", signInRes.status, await signInRes.text());
    process.exit(1);
  }

  const cookies = signInRes.headers.getSetCookie?.() || [];
  console.log("Sign-in successful, got", cookies.length, "cookies");

  // Extract session token
  const sessionCookie = cookies.find((c: string) => c.includes("authjs.session-token"));
  if (!sessionCookie) {
    console.error("No session cookie found");
    process.exit(1);
  }

  const cookieHeader = cookies.map((c: string) => c.split(";")[0]).join("; ");
  console.log("Cookie header:", cookieHeader.substring(0, 100) + "...");

  console.log("\n2. Triggering analysis pipeline (scope=new)...");

  const analysisRes = await fetch(
    "http://localhost:3000/api/v1/admin/analysis/run?scope=new",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
    }
  );

  const result = await analysisRes.json();
  console.log("\nAnalysis trigger result:");
  console.log(JSON.stringify(result, null, 2));

  if (!analysisRes.ok) {
    console.error("Failed to trigger analysis:", analysisRes.status);
    process.exit(1);
  }

  console.log("\n3. Analysis pipeline triggered successfully!");
  console.log(`Queued ${result.signalsQueued || 0} signals for analysis`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
