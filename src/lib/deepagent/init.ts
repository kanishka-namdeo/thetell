/**
 * DeepAgent initialization module
 *
 * Handles checkpointer setup at app startup for production durability.
 * PostgresSaver provides ACID-compliant state persistence that survives restarts.
 */

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { logger } from "@/lib/logger";

let checkpointer: PostgresSaver | null = null;
let setupPromise: Promise<PostgresSaver> | null = null;

/**
 * Initialize and return the PostgresSaver checkpointer.
 *
 * Uses a singleton pattern to ensure setup() runs only once.
 * The setup() call creates checkpoint tables in PostgreSQL.
 *
 * @returns Initialized PostgresSaver instance
 */
export async function initCheckpointer(): Promise<PostgresSaver> {
  // Return existing checkpointer if already initialized
  if (checkpointer) {
    return checkpointer;
  }

  // Prevent concurrent initialization
  if (setupPromise) {
    return setupPromise;
  }

  setupPromise = (async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured for DeepAgent persistence");
    }

    logger.info("deepagent.checkpointer.initializing", {
      databaseUrl: databaseUrl.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@"),
    });

    const saver = PostgresSaver.fromConnString(databaseUrl);

    // Create checkpoint tables if they don't exist
    await saver.setup();

    logger.info("deepagent.checkpointer.initialized");

    checkpointer = saver;
    return saver;
  })();

  return setupPromise;
}

/**
 * Get the checkpointer instance.
 *
 * Throws if not initialized. Call initCheckpointer() first.
 */
export function getCheckpointer(): PostgresSaver {
  if (!checkpointer) {
    throw new Error("Checkpointer not initialized. Call initCheckpointer() first.");
  }
  return checkpointer;
}
