/**
 * Inngest client initialization.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "the-tell",
  eventKey: process.env.INNGEST_EVENT_KEY || (process.env.INNGEST_DEV ? "dev-event-key" : undefined),
  signingKey: process.env.INNGEST_SIGNING_KEY,
  baseUrl: process.env.INNGEST_BASE_URL || (
    process.env.NODE_ENV === "production"
      ? undefined
      : "http://localhost:8288"
  ),
});
