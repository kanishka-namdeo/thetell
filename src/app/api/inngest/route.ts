import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";
import { subredditDiscoveryFunctions } from "@/lib/inngest/subreddit-discovery";
import { enrichmentFunctions } from "@/lib/inngest/enrichment";
import { discoveryFunctions } from "@/lib/inngest/discovery";
import { hypothesisFunctions } from "@/lib/inngest/hypothesis";
import { batchDiscoveryFunction } from "@/lib/inngest/batch-discovery";
import { orphanRecoveryFunctions } from "@/lib/inngest/orphan-recovery";

const handler = serve({
  client: inngest,
  functions: [
    ...functions,
    ...subredditDiscoveryFunctions,
    ...enrichmentFunctions,
    ...discoveryFunctions,
    ...hypothesisFunctions,
    batchDiscoveryFunction,
    ...orphanRecoveryFunctions,
  ],
});

export { handler as GET, handler as POST, handler as PUT };
