/**
 * Inngest client initialization.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "the-tell",
  signingKey: process.env.INNGEST_SIGNING_KEY,
  baseUrl: "http://localhost:8288",
});
