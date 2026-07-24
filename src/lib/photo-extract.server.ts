/**
 * Photo (image) extraction via Lovable AI Gateway vision model.
 * Server-only.
 */

import type { ExtractedEvent } from "./pdf-extract.server";

const EVENT_TYPES = [
  "Visit",
  "Lab result",
  "Medication",
  "Symptom",
  "Procedure",
  "Vaccination",
  "Imaging",
  "Other",
];

const SYS = `You extract structured medical events from photos of clinical documents (printouts, after-visit summaries, lab reports, prescription bottles, discharge papers, handwritten notes).

Return a JSON object: { "events": Event[] }
Each Event:
{
  "event_date": "YYYY-MM-DD",
  "event_type": one of ${JSON.stringify(EVENT_TYPES)},
  "title": "short, human title",
  "description": "concise summary (1-3 sentences), include key values, dosages, instructions",
  "provider": "clinician or facility if visible",
  "location": "clinic/hospital if visible",
  "tags": ["short","tags"]
}

Rules:
- Split distinct items into separate events.
- Never invent values; omit fields you cannot read.
- For labs, include abnormal flags in description.
- Parse any date format into YYYY-MM-DD. Month/year only -> use the 1st. No date -> use today.
- Return ONLY valid JSON, no prose.`;

export async function extractEventsFromImage(
  imageBase64: string,
  mimeType: string,
  todayIso: string,
): Promise<ExtractedEvent[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYS },
        {
          role: "user",
          content: [
            { type: "text", text: `Today is ${todayIso}. Extract events from this image.` },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
    throw new Error(`Vision model ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const jsonStr = extractJson(raw);
  if (!jsonStr) throw new Error("Model did not return JSON");
  const parsed = JSON.parse(jsonStr) as { events?: ExtractedEvent[] };
  return (parsed.events ?? []).filter((e) => e && e.title && e.event_date);
}

function extractJson(s: string): string | null {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return null;
}
