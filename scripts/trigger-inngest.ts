process.env.DATABASE_URL = "postgresql://thell_user:thell_password@localhost:5433/the_tell";

import { inngest } from "../src/lib/inngest/client";

async function main() {
  const signalId = "cmqw39ut2004ea8lnuhoixjw3";
  
  console.log("=== Triggering Inngest analysis for", signalId, "===\n");

  try {
    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId },
    });
    
    console.log("✓ Event sent to Inngest dev server");
    console.log("The analysis pipeline will now run asynchronously.");
    console.log("Check http://localhost:8288 for progress.");
    
    process.exit(0);
  } catch (error) {
    console.error("✗ Failed to send event:", error);
    process.exit(1);
  }
}

main();
