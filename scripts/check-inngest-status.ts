import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { inngest } = await import("../src/lib/inngest/client");

  console.log("Checking Inngest event status...\n");

  try {
    // Try to get recent events
    const response = await fetch("http://localhost:8288/v1/events?limit=5");
    
    if (response.ok) {
      const events = await response.json();
      console.log("Recent Inngest Events:");
      console.log(JSON.stringify(events, null, 2));
    } else {
      console.log(`Inngest API returned ${response.status}`);
    }
  } catch (error) {
    console.error("Failed to fetch Inngest events:", error);
  }

  // Check if discovery job is registered
  console.log("\nChecking registered functions...");
  try {
    const response = await fetch("http://localhost:8288/v1/functions");
    if (response.ok) {
      const functions = await response.json();
      console.log(`Found ${functions.length} registered functions`);
      const discoveryFn = functions.find((f: any) => f.id.includes("discover"));
      if (discoveryFn) {
        console.log("Discovery function is registered:", discoveryFn.id);
      } else {
        console.log("Discovery function NOT found in registered functions");
      }
    }
  } catch (error) {
    console.error("Failed to fetch functions:", error);
  }
}

main().catch(console.error);
