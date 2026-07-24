import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type HydraHit = {
  id: string;
  score: number;
  text: string;
  metadata: JsonValue;
};

export const hydraWriteMemoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { text: string; id?: string; metadata?: Record<string, JsonValue>; source?: string }) =>
      input,
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { ingestMemory } = await import("./hydra.server");
    await ingestMemory({
      userId: context.userId,
      id: data.id,
      text: data.text,
      metadata: data.metadata,
      source: data.source,
    });
    return { ok: true };
  });

export const hydraDeleteMemoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; source?: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { deleteMemory } = await import("./hydra.server");
    await deleteMemory(context.userId, data.ids, data.source);
    return { ok: true };
  });

export const hydraSearchMemoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; limit?: number; source?: string }) => input)
  .handler(async ({ data, context }): Promise<HydraHit[]> => {
    const { queryMemory } = await import("./hydra.server");
    const hits = await queryMemory(context.userId, data.query, data.limit ?? 5, data.source);
    return hits.map((h) => ({
      id: h.id,
      score: h.score,
      text: h.text,
      metadata: (h.metadata ?? null) as JsonValue,
    }));
  });
