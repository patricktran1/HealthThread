import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nebiusChat } from "./nebius.server";

export type Insight = {
  title: string;
  detail: string;
  evidence: string[];
};

export const generateInsightsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ insights: Insight[] }> => {
    const { supabase, userId } = context;
    const { queryMemory } = await import("./hydra.server");

    const { data: events } = await supabase
      .from("health_events")
      .select("event_date, event_type, title, description, tags")
      .eq("user_id", userId)
      .order("event_date", { ascending: false })
      .limit(40);

    if (!events || events.length < 3) {
      return { insights: [] };
    }

    // Pull semantic context for common health themes from Hydra so the
    // model can ground its observations in retrieved memory.
    const themes = ["headache", "blood pressure", "medication"];
    const memorySnippets: string[] = [];
    for (const t of themes) {
      const hits = await queryMemory(userId, t, 3, "insights:generate").catch(() => []);
      for (const h of hits) memorySnippets.push(`• ${h.text}`);
    }

    const compactEvents = events
      .map(
        (e) =>
          `${e.event_date} | ${e.event_type} | ${e.title}${
            e.description ? ` — ${e.description.slice(0, 160)}` : ""
          }${e.tags?.length ? ` [${e.tags.join(", ")}]` : ""}`,
      )
      .join("\n");

    const system = `You are HealthThread's insight engine. Given a patient's recent health events and retrieved memory, surface 2-4 SHORT, factual patterns or trends the user should be aware of. Examples: "Headaches reported 4x this month, mostly after poor sleep", "Home BP trending down since starting lisinopril".

Rules:
- NEVER diagnose. NEVER give treatment advice. Just surface observed patterns.
- Each insight must be grounded in at least one specific event. Quote dates.
- Be specific with numbers/dates when possible. No vague generalities.
- Return STRICT JSON ONLY in this shape: {"insights":[{"title":"...","detail":"...","evidence":["YYYY-MM-DD ...","YYYY-MM-DD ..."]}]}
- title: <= 60 chars. detail: 1-2 sentences. evidence: 1-3 short quotes from the events.
- If there isn't enough data for meaningful patterns, return {"insights":[]}.`;

    const user = `RECENT EVENTS (most recent first):\n${compactEvents}\n\nRETRIEVED MEMORY SNIPPETS:\n${memorySnippets.join("\n") || "(none)"}`;

    const reply = await nebiusChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      maxTokens: 600,
    });

    const raw = reply.content?.trim() ?? "";
    // Strip code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/, "")
      .trim();
    try {
      const parsed = JSON.parse(cleaned) as { insights?: Insight[] };
      return { insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 4) : [] };
    } catch {
      return { insights: [] };
    }
  });
