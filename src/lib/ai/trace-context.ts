import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceContext {
  sessionId: string;
  traceName: string;
  metadata?: Record<string, unknown>;
}

const traceStore = new AsyncLocalStorage<TraceContext>();

export function runWithTrace<T>(ctx: TraceContext, fn: () => T): T {
  return traceStore.run(ctx, fn);
}

export async function runWithTraceAsync<T>(
  ctx: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  return traceStore.run(ctx, fn);
}

export function getTraceContext(): TraceContext | undefined {
  return traceStore.getStore();
}
