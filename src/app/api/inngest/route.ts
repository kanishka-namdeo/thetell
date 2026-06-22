import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";
import { companyDiscoveryFunctions } from "@/lib/inngest/company-discovery";
import { subredditDiscoveryFunctions } from "@/lib/inngest/subreddit-discovery";
import { enrichmentFunctions } from "@/lib/inngest/enrichment";

const handler = serve({
  client: inngest,
  functions: [...functions, ...companyDiscoveryFunctions, ...subredditDiscoveryFunctions, ...enrichmentFunctions],
});

export { handler as GET, handler as POST };
