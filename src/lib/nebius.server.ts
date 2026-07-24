/**
 * Nebius AI Studio client (server-only).
 * OpenAI-compatible chat completions API.
 * Docs: https://docs.nebius.com/studio/inference/api
 */

const BASE_URL = "https://api.studio.nebius.com/v1";
export const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

export type NebiusToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type NebiusMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: NebiusToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type NebiusTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type NebiusChoiceMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: NebiusToolCall[];
};

export async function nebiusChat(params: {
  messages: NebiusMessage[];
  tools?: NebiusTool[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<NebiusChoiceMessage> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: params.model ?? DEFAULT_MODEL,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens ?? 800,
  };
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nebius ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: NebiusChoiceMessage }>;
  };
  const msg = data.choices?.[0]?.message;
  return {
    role: "assistant",
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls,
  };
}
