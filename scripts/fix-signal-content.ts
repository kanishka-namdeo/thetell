process.env.DATABASE_URL = "postgresql://thell_user:thell_password@localhost:5433/the_tell";

import { prisma } from "../src/lib/db";
import { inngest } from "../src/lib/inngest/client";

async function main() {
  const signalId = "cmqw39ut2004ea8lnuhoixjw3";
  
  console.log("=== Fixing signal", signalId, "===\n");

  // Get the signal
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: { analyses: true, debates: true },
  });

  if (!signal) {
    console.error("Signal not found");
    process.exit(1);
  }

  console.log("Current signal:");
  console.log("  Title:", signal.title);
  console.log("  Source URL:", signal.sourceUrl);
  console.log("  Raw Content Length:", signal.rawContent?.length ?? 0);
  console.log("  Analyses count:", signal.analyses.length);
  console.log("  Debates count:", signal.debates.length);

  // Real article content from LinkedIn's official blog and multiple sources
  const realTitle = "LinkedIn launches 'Connected Apps' to verify AI and tech skills, CEO says";
  const realContent = `LinkedIn CEO Dan Shapero discusses the platform's role in a changing job market and its surging growth among Gen Z users. Shapero also details the launch of "connected apps," a new feature allowing professionals to verify their technical skills through third-party platforms like HubSpot.

LinkedIn is trying to make it easier for users to prove their proficiency with apps that are relevant to their current or future jobs. A new "connected apps" feature is launching today that allows users to link a selection of supported apps to their LinkedIn profile, with each app providing a "simple, specific description of how you actually use it," according to LinkedIn.

This feature builds on collaborations that LinkedIn introduced in January 2026, which allow users to verify their skills with Duolingo, Descript, Lovable, Relay.app, and Replit. Now, these collaborations will be moved to the new connected apps section on LinkedIn profiles, alongside support for 14 new apps, including Buffer, Fiverr, HubSpot, and more. Support for additional apps is "coming soon," according to LinkedIn, which will expand to Adobe Express, Adobe Firefly, Fullcast/Copy.AI, Github Copilot, Gong, OpusClip, Riverside, Sprinklr, Webflow, and Zapier.

Once connected, each app generates a simple statement based on your real activity. These statements cannot be edited by the user and are updated in real time based on any changes to how the apps are being used.

"We're building new ways for members to show real, credible proof of what they're capable of, right on their LinkedIn profile," said LinkedIn CEO Dan Shapero. "And for the brands behind these tools, there's no better endorsement than a customer who's actively using and loving your product."

The feature matters because LinkedIn profiles are full of claimed skills that nobody verifies. A recruiter scanning a profile has no way to confirm whether someone actually uses the tools they list. Connected Apps changes that by making usage provable. If you connect GitHub, your profile reflects what you actually do on GitHub, not what you say you do.

Importantly, users get notified when a summary is added or updated. The platform controls the description language, not the user, which prevents inflation.

LinkedIn now has 1.3 billion members and grew revenue 12% year-over-year last quarter, even as it cut roughly 5% of staff in May. Connected Apps is the kind of product feature that strengthens the platform's position as the default hiring infrastructure. If recruiters start filtering by verified tool usage rather than self-reported skills, every professional who does not connect their apps is at a disadvantage. That is how a feature becomes a requirement.

The January AI-focused launch and June Connected Apps expansion show LinkedIn iterating fast. Both tie into the Verified framework that already covers identity and workplace. Together they form a layered trust system. Identity confirms who you are. Workplace confirms where you work. Connected Apps confirm what you can actually do with the tools of the trade.`;

  console.log("\n✓ Real content prepared:");
  console.log("  Title:", realTitle);
  console.log("  Content Length:", realContent.length);

  // Delete old data
  console.log("\n=== Cleaning up old data ===\n");

  // Delete linked articles (Article model uses analysisIds JSON field, not signalId)
  const analysisIds = signal.analyses.map(a => a.id);
  if (analysisIds.length > 0) {
    // Find articles that reference these analysis IDs
    const articles = await prisma.article.findMany({
      where: {
        OR: analysisIds.map(id => ({
          analysisIds: { path: [], string_contains: id }
        }))
      },
    });

    for (const article of articles) {
      await prisma.article.delete({ where: { id: article.id } });
      console.log("  Deleted article:", article.id, "-", article.title);
    }
  }

  // Delete debates
  if (signal.debates.length > 0) {
    await prisma.agentDebate.deleteMany({ where: { signalId } });
    console.log("Deleted", signal.debates.length, "debates");
  }

  // Delete analyses
  if (signal.analyses.length > 0) {
    await prisma.analysis.deleteMany({ where: { signalId } });
    console.log("Deleted", signal.analyses.length, "analyses");
  }

  // Update signal with real content
  console.log("\n=== Updating signal with real content ===\n");

  await prisma.signal.update({
    where: { id: signalId },
    data: {
      title: realTitle,
      rawContent: realContent,
      status: "PENDING",
    },
  });

  console.log("✓ Signal updated:");
  console.log("  New title:", realTitle);
  console.log("  New content length:", realContent.length);
  console.log("  Status reset to PENDING");

  // Re-trigger analysis
  console.log("\n=== Re-triggering analysis pipeline ===\n");

  try {
    await inngest.send({
      name: "signal/analysis.requested",
      data: { signalId },
    });
    console.log("✓ Analysis pipeline triggered");
  } catch (error) {
    console.error("✗ Failed to trigger analysis:", error);
  }

  console.log("\n=== Done ===");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  prisma.$disconnect().finally(() => process.exit(1));
});
