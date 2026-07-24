import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nebiusChat } from "./nebius.server";

type GenerateInput = {
  systemPrompt: string;
  userMessage: string;
  context?: string;
};

export const nebiusGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateInput) => {
    if (typeof input?.userMessage !== "string" || !input.userMessage.trim()) {
      throw new Error("userMessage is required");
    }
    return {
      systemPrompt: String(input.systemPrompt ?? ""),
      userMessage: String(input.userMessage),
      context: typeof input.context === "string" ? input.context : "",
    };
  })
  .handler(async ({ data }) => {
    const system = [
      data.systemPrompt,
      "Always answer ONLY from the provided MEMORY CONTEXT. If the context doesn't contain the answer, say so plainly and suggest the user log the event. Never diagnose, prescribe, or replace a clinician. Be concise and friendly.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const userContent = data.context
      ? `MEMORY CONTEXT:\n${data.context}\n\nQUESTION:\n${data.userMessage}`
      : data.userMessage;

    const reply = await nebiusChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });

    return { text: reply.content?.trim() ?? "" };
  });
