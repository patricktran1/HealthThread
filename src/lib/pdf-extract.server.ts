/**
 * PDF parsing + event extraction (server-only).
 */
import { extractText, getDocumentProxy } from "unpdf";
import { nebiusChat } from "./nebius.server";

export type ExtractedEvent = {
  event_date: string;
  event_type: string;
  title: string;
  description?: string;
  provider?: string;
  location?: string;
  tags?: string[];
};

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

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

const SYS = `You extract structured medical events from clinical documents (after-visit summaries, lab reports, discharge papers).

Return a JSON object: { "events": Event[] }
Each Event:
{
  "event_date": "YYYY-MM-DD",   // best-known date for that event; use visit/collection/result date
  "event_type": one of ${JSON.stringify(EVENT_TYPES)},
  "title": "short, human title (e.g. 'CBC panel', 'Follow-up visit', 'Amoxicillin 500mg')",
  "description": "concise summary including key findings, values, instructions (1-3 sentences)",
  "provider": "clinician or facility name if present",
  "location": "clinic/hospital if present",
  "tags": ["short", "tags"]
}

Rules:
- Split distinct items into separate events (a visit, three labs, two new meds => five events).
- Never invent values. Omit fields you cannot find.
- For lab panels with abnormal flags, mention them in description.
- Dates: parse any format into YYYY-MM-DD. If only a month/year is given, use the 1st.
- If document has no date, use today.

Return ONLY valid JSON, no prose.`;

export async function extractEventsFromText(
  text: string,
  todayIso: string,
): Promise<ExtractedEvent[]> {
  const truncated = text.length > 15000 ? text.slice(0, 15000) + "\n…[truncated]" : text;

  const reply = await nebiusChat({
    messages: [
      { role: "system", content: SYS },
      {
        role: "user",
        content: `Today is ${todayIso}.\n\nDOCUMENT:\n${truncated}`,
      },
    ],
    temperature: 0,
    maxTokens: 2000,
  });

  const raw = reply.content ?? "";
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
