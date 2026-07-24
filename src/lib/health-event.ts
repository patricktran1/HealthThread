export const HEALTH_EVENT_TYPES = [
  "Visit",
  "Lab result",
  "Medication",
  "Symptom",
  "Procedure",
  "Vaccination",
  "Imaging",
  "Other",
] as const;

export type HealthEventType = (typeof HEALTH_EVENT_TYPES)[number];

export type HealthEventFormInput = {
  event_date: string;
  event_type: string;
  title: string;
  description?: string;
  provider?: string;
  location?: string;
  tags?: string | string[];
};

export type NormalizedHealthEvent = {
  event_date: string;
  event_type: HealthEventType;
  title: string;
  description: string | null;
  provider: string | null;
  location: string | null;
  tags: string[] | null;
  memoryText: string;
};

const LIMITS = {
  title: 160,
  description: 5_000,
  provider: 160,
  location: 160,
  tag: 40,
  tags: 20,
} as const;

function normalizeOptional(value: string | undefined, field: keyof typeof LIMITS): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > LIMITS[field]) {
    throw new Error(`${field} exceeds ${LIMITS[field]} characters`);
  }
  return normalized;
}

function normalizeDate(value: string): string {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new Error("event_date must use YYYY-MM-DD");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error("event_date is not a valid calendar date");
  }
  return normalized;
}

function normalizeType(value: string): HealthEventType {
  const normalized = value.trim();
  if (!HEALTH_EVENT_TYPES.includes(normalized as HealthEventType)) {
    throw new Error("event_type is not supported");
  }
  return normalized as HealthEventType;
}

function normalizeTags(value: string | string[] | undefined): string[] | null {
  const raw = Array.isArray(value) ? value : (value ?? "").split(",");
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const tag = item.trim();
    if (!tag) continue;
    if (tag.length > LIMITS.tag) throw new Error(`tag exceeds ${LIMITS.tag} characters`);
    const key = tag.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length > LIMITS.tags) throw new Error(`tags exceed ${LIMITS.tags} entries`);
  }

  return tags.length ? tags : null;
}

export function normalizeHealthEvent(input: HealthEventFormInput): NormalizedHealthEvent {
  const eventDate = normalizeDate(input.event_date);
  const eventType = normalizeType(input.event_type);
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  if (title.length > LIMITS.title) throw new Error(`title exceeds ${LIMITS.title} characters`);

  const description = normalizeOptional(input.description, "description");
  const provider = normalizeOptional(input.provider, "provider");
  const location = normalizeOptional(input.location, "location");
  const tags = normalizeTags(input.tags);
  const memoryText = `${eventDate} — ${eventType}: ${title}${description ? `. ${description}` : ""}`;

  return {
    event_date: eventDate,
    event_type: eventType,
    title,
    description,
    provider,
    location,
    tags,
    memoryText,
  };
}
