import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChatAgentInput = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
};

export type SuggestedEvent = {
  event_date: string;
  event_type: string;
  title: string;
  description?: string;
  provider?: string;
  location?: string;
  tags?: string[];
};

export type ChatToolEvent = {
  name: string;
  summary: string;
  suggestion?: SuggestedEvent;
};

export const chatAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ChatAgentInput) => {
    if (!input || typeof input.userMessage !== "string" || !input.userMessage.trim()) {
      throw new Error("userMessage is required");
    }
    const history = Array.isArray(input.history) ? input.history : [];
    return {
      userMessage: input.userMessage,
      history: history
        .filter(
          (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
        )
        .slice(-20),
    };
  })
  .handler(async ({ data, context }): Promise<{ text: string; toolEvents: ChatToolEvent[] }> => {
    const { runChatAgent } = await import("./chat-agent.server");
    const { supabase, userId } = context;
    const result = await runChatAgent({ supabase, userId }, data);
    return {
      text: result.text,
      toolEvents: result.toolEvents.map((e) => {
        const r = e.result as {
          summary?: string;
          ok?: boolean;
          error?: string;
          suggestion?: SuggestedEvent;
        };
        return {
          name: e.name,
          summary: r.summary ?? (r.ok === false ? `error: ${r.error ?? "unknown"}` : "done"),
          suggestion: r.suggestion,
        };
      }),
    };
  });
