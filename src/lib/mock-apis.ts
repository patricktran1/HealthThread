/**
 * Memory + AI integration points for HealthThread.
 *
 * - HydraDB (write/search): live, via server functions in `hydra.functions.ts`.
 * - Nebius AI (generation): live, via server function in `nebius.functions.ts`.
 */

import { hydraWriteMemoryFn, hydraSearchMemoryFn, hydraDeleteMemoryFn } from "./hydra.functions";
import { nebiusGenerateFn } from "./nebius.functions";

export type HydraMemoryRecord = {
  id: string;
  userId: string;
  kind: "event" | "profile" | "note";
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type HydraSearchHit = {
  id: string;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
};

/** Write a memory record to HydraDB via the authenticated server function. */
export async function hydraWriteMemory(
  input: Omit<HydraMemoryRecord, "id" | "createdAt"> & { id?: string; source?: string },
): Promise<void> {
  try {
    await hydraWriteMemoryFn({
      data: {
        id: input.id,
        text: input.text,
        metadata: { kind: input.kind, ...(input.metadata ?? {}) } as unknown as Record<string, never>,
        source: input.source,
      },
    });
  } catch (err) {
    console.warn("[hydraWriteMemory] failed:", err);
  }
}

/** Delete one or more memories from HydraDB. */
export async function hydraDeleteMemory(ids: string[], source?: string): Promise<void> {
  if (ids.length === 0) return;
  try {
    await hydraDeleteMemoryFn({ data: { ids, source } });
  } catch (err) {
    console.warn("[hydraDeleteMemory] failed:", err);
  }
}

/** Semantic search across a user's medical memory in HydraDB. */
export async function hydraSearchMemory(
  _userId: string,
  query: string,
  limit = 5,
  source?: string,
): Promise<HydraSearchHit[]> {
  try {
    const hits = await hydraSearchMemoryFn({ data: { query, limit, source } });
    return hits as HydraSearchHit[];
  } catch (err) {
    console.warn("[hydraSearchMemory] failed:", err);
    return [];
  }
}

/** Generate an assistant response with Nebius AI (Llama 3.1 70B by default). */
export async function nebiusGenerate(params: {
  systemPrompt: string;
  userMessage: string;
  context?: string;
}): Promise<{ text: string }> {
  try {
    const { text } = await nebiusGenerateFn({ data: params });
    return { text };
  } catch (err) {
    console.warn("[nebiusGenerate] failed:", err);
    return {
      text: "I'm having trouble reaching the AI service right now. Please try again in a moment.",
    };
  }
}
