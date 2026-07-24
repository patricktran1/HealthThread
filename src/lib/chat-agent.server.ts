/**
 * Tool-calling chat agent (server-only).
 * Lets the LLM read/write the user's health thread via structured tools.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { nebiusChat, type NebiusMessage, type NebiusTool } from "./nebius.server";
import { ingestMemory, deleteMemory, queryMemory } from "./hydra.server";

const SYSTEM_PROMPT = `You are HealthThread's memory agent.

You help the user remember and manage their personal medical history. You can:
- Suggest logging a new health event with the suggest_log_event tool when the user mentions a symptom, visit, medication, or other health fact in passing (e.g. "I've had a headache for 3 days", "started lisinopril yesterday"). This proposes a draft the user can save with one click; do NOT save anything yourself.
- Log new health events directly with the log_event tool ONLY when the user explicitly asks to save/log/record something.
- Search the user's saved history with search_history BEFORE answering any question about their past.
- Update an existing event with update_event when they correct or add detail.
- Delete an event with delete_event ONLY when they explicitly ask to remove it.

Rules:
- Never diagnose, prescribe, or replace a clinician.
- Always call search_history first when asked about the past; do not guess.
- Default to suggest_log_event over log_event when the user is just sharing how they feel. Don't ask permission first — call the tool, then in your reply briefly acknowledge and let the button speak for itself.
- For symptoms with duration ("for 3 days", "since Monday"), set event_date to the onset date, and mention duration in the description.
- Infer event_type from one of: Visit, Lab result, Medication, Symptom, Procedure, Vaccination, Imaging, Other.
- Use today's date if the user doesn't specify one. Today is ${new Date().toISOString().slice(0, 10)}.
- After a successful tool call, briefly confirm what you did or proposed in plain language. Be concise and warm.`;

const EVENT_PROPS = {
  event_date: { type: "string", description: "ISO date YYYY-MM-DD" },
  event_type: {
    type: "string",
    enum: [
      "Visit",
      "Lab result",
      "Medication",
      "Symptom",
      "Procedure",
      "Vaccination",
      "Imaging",
      "Other",
    ],
  },
  title: { type: "string", description: "Short title, e.g. 'Headache' or 'Annual physical'" },
  description: { type: "string", description: "Additional detail, optional" },
  provider: { type: "string", description: "Clinician or provider name, optional" },
  location: { type: "string", description: "Clinic/hospital, optional" },
  tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
} as const;

const TOOLS: NebiusTool[] = [
  {
    type: "function",
    function: {
      name: "suggest_log_event",
      description:
        "Propose a structured event for the user to save with one click. Use this when the user mentions a symptom, medication, visit, or other health fact in passing but did NOT explicitly ask to log it. Does not save anything.",
      parameters: {
        type: "object",
        properties: EVENT_PROPS,
        required: ["event_date", "event_type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_event",
      description:
        "Save a new health event to the user's thread. Use ONLY when the user explicitly asks to log/save/record something.",
      parameters: {
        type: "object",
        properties: EVENT_PROPS,
        required: ["event_date", "event_type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_history",
      description:
        "Semantically search the user's saved health memory. Use this before answering any question about their past.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number", description: "Default 5" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description: "Update fields on an existing event. Only pass fields that should change.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          event_date: { type: "string" },
          event_type: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          provider: { type: "string" },
          location: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description:
        "Delete an event by id. Only call this when the user explicitly asks to remove it.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];

type ToolResult = Record<string, unknown>;

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { supabase: SupabaseClient; userId: string },
): Promise<ToolResult> {
  const { supabase, userId } = ctx;

  if (name === "suggest_log_event") {
    const suggestion = {
      event_date: String(args.event_date),
      event_type: String(args.event_type),
      title: String(args.title),
      description: args.description ? String(args.description) : undefined,
      provider: args.provider ? String(args.provider) : undefined,
      location: args.location ? String(args.location) : undefined,
      tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
    };
    return {
      ok: true,
      suggestion,
      summary: `Suggested: ${suggestion.event_type} — ${suggestion.title}`,
    };
  }

  if (name === "log_event") {
    const row = {
      user_id: userId,
      event_date: String(args.event_date),
      event_type: String(args.event_type),
      title: String(args.title),
      description: args.description ? String(args.description) : null,
      provider: args.provider ? String(args.provider) : null,
      location: args.location ? String(args.location) : null,
      tags: Array.isArray(args.tags) ? (args.tags as string[]) : null,
    };
    const { data, error } = await supabase.from("health_events").insert(row).select().single();
    if (error) return { ok: false, error: error.message };
    await ingestMemory({
      userId,
      id: data.id,
      text: `${row.event_date} — ${row.event_type}: ${row.title}.${row.description ? ` ${row.description}` : ""}`,
      metadata: { eventId: data.id, provider: row.provider, tags: row.tags },
      source: "chat:log_event",
    }).catch((e) => console.warn("[hydra ingest]", e));
    return {
      ok: true,
      id: data.id,
      summary: `Logged: ${row.event_date} ${row.event_type} — ${row.title}`,
    };
  }

  if (name === "search_history") {
    const q = String(args.query ?? "");
    const limit = typeof args.limit === "number" ? args.limit : 5;
    const hits = await queryMemory(userId, q, limit, "chat:search_history").catch(() => []);
    const { data: rows } = await supabase
      .from("health_events")
      .select("id, event_date, event_type, title, description, provider")
      .order("event_date", { ascending: false })
      .limit(10);
    return {
      semantic_hits: hits.map((h) => ({ id: h.id, text: h.text, score: h.score })),
      recent_events: rows ?? [],
    };
  }

  if (name === "update_event") {
    const id = String(args.id);
    const patch: Record<string, unknown> = {};
    for (const k of ["event_date", "event_type", "title", "description", "provider", "location"]) {
      if (args[k] !== undefined) patch[k] = args[k];
    }
    if (Array.isArray(args.tags)) patch.tags = args.tags;
    const { data, error } = await supabase
      .from("health_events")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    await ingestMemory({
      userId,
      id: data.id,
      text: `${data.event_date} — ${data.event_type}: ${data.title}.${data.description ? ` ${data.description}` : ""}`,
      metadata: { eventId: data.id, provider: data.provider, tags: data.tags },
      source: "chat:update_event",
    }).catch((e) => console.warn("[hydra upsert]", e));
    return { ok: true, id, summary: "Event updated." };
  }

  if (name === "delete_event") {
    const id = String(args.id);
    const { error } = await supabase.from("health_events").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await deleteMemory(userId, [id], "chat:delete_event").catch((e) =>
      console.warn("[hydra delete]", e),
    );
    return { ok: true, id, summary: "Event deleted." };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

export type AgentTurnInput = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
};

export type AgentToolEvent = {
  name: string;
  args: Record<string, unknown>;
  result: ToolResult;
};

export async function runChatAgent(
  ctx: { supabase: SupabaseClient; userId: string },
  input: AgentTurnInput,
): Promise<{ text: string; toolEvents: AgentToolEvent[] }> {
  const messages: NebiusMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...input.history.map((m) => ({ role: m.role, content: m.content }) as NebiusMessage),
    { role: "user", content: input.userMessage },
  ];

  const toolEvents: AgentToolEvent[] = [];
  const MAX_STEPS = 6;

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await nebiusChat({ messages, tools: TOOLS });
    messages.push({
      role: "assistant",
      content: reply.content,
      tool_calls: reply.tool_calls,
    });

    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      return { text: reply.content?.trim() ?? "", toolEvents };
    }

    for (const call of reply.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await runTool(call.function.name, args, ctx).catch((e) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      toolEvents.push({ name: call.function.name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { text: "I ran out of steps trying to do that. Please try rephrasing.", toolEvents };
}
