import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SeedEvent = {
  daysAgo: number;
  event_type: string;
  title: string;
  description: string;
  provider?: string;
  location?: string;
  tags?: string[];
};

const SEED: SeedEvent[] = [
  // Recurring headaches pattern (proactive insight will catch this)
  {
    daysAgo: 2,
    event_type: "Symptom",
    title: "Headache",
    description:
      "Throbbing, right temple. Started after a poor night of sleep (~4 hrs). Eased with ibuprofen 400mg.",
    tags: ["headache", "sleep"],
  },
  {
    daysAgo: 9,
    event_type: "Symptom",
    title: "Headache",
    description: "Dull frontal headache after late night. Resolved by afternoon.",
    tags: ["headache", "sleep"],
  },
  {
    daysAgo: 17,
    event_type: "Symptom",
    title: "Headache",
    description: "Mild headache, screen-heavy workday.",
    tags: ["headache"],
  },
  {
    daysAgo: 28,
    event_type: "Symptom",
    title: "Headache",
    description: "Bad migraine, took day off. Trigger likely poor sleep + stress.",
    tags: ["headache", "sleep"],
  },

  // BP trend - elevated then improving
  {
    daysAgo: 5,
    event_type: "Other",
    title: "Home BP reading 128/82",
    description: "Morning, resting. Pulse 72.",
    tags: ["blood-pressure", "vitals"],
  },
  {
    daysAgo: 14,
    event_type: "Other",
    title: "Home BP reading 134/86",
    description: "Evening after work. Pulse 78.",
    tags: ["blood-pressure", "vitals"],
  },
  {
    daysAgo: 30,
    event_type: "Other",
    title: "Home BP reading 142/91",
    description: "Morning. Elevated. Started monitoring weekly.",
    tags: ["blood-pressure", "vitals"],
  },
  {
    daysAgo: 60,
    event_type: "Other",
    title: "Home BP reading 138/88",
    description: "First baseline reading at home.",
    tags: ["blood-pressure", "vitals"],
  },

  // Visits & meds
  {
    daysAgo: 25,
    event_type: "Visit",
    title: "Annual physical",
    description:
      "All vitals reviewed. Discussed BP trend. Doctor recommended low-sodium diet and a recheck in 8 weeks.",
    provider: "Dr. Patel",
    location: "Riverside Family Health",
    tags: ["checkup"],
  },
  {
    daysAgo: 22,
    event_type: "Medication",
    title: "Started Lisinopril 10mg",
    description: "Once daily, morning. Prescribed by Dr. Patel for stage-1 hypertension.",
    provider: "Dr. Patel",
    tags: ["medication", "blood-pressure"],
  },
  {
    daysAgo: 24,
    event_type: "Lab result",
    title: "Lipid panel + CMP",
    description:
      "LDL 132 (slightly elevated), HDL 48, Triglycerides 156. Fasting glucose 94. Kidney/liver normal.",
    provider: "Quest Diagnostics",
    tags: ["labs", "cholesterol"],
  },

  // Older
  {
    daysAgo: 75,
    event_type: "Vaccination",
    title: "Flu shot",
    description: "Seasonal influenza, quadrivalent.",
    location: "CVS Pharmacy",
    tags: ["vaccine"],
  },
  {
    daysAgo: 120,
    event_type: "Imaging",
    title: "Chest X-ray",
    description: "Clear. Performed for persistent cough that resolved on its own.",
    provider: "Riverside Imaging",
    tags: ["imaging"],
  },
  {
    daysAgo: 180,
    event_type: "Procedure",
    title: "Dental cleaning",
    description: "Routine cleaning, no cavities.",
    provider: "Dr. Kim, DDS",
    location: "Bright Smile Dental",
    tags: ["dental"],
  },
];

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const seedDemoDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reset?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { ingestMemory, deleteMemory } = await import("./hydra.server");

    if (data.reset) {
      const { data: existing } = await supabase
        .from("health_events")
        .select("id")
        .eq("user_id", userId);
      const ids = (existing ?? []).map((r) => r.id);
      if (ids.length > 0) {
        await supabase.from("health_events").delete().eq("user_id", userId);
        await deleteMemory(userId, ids, "demo:reset").catch(() => {});
      }
    }

    const rows = SEED.map((s) => ({
      user_id: userId,
      event_date: dateNDaysAgo(s.daysAgo),
      event_type: s.event_type,
      title: s.title,
      description: s.description,
      provider: s.provider ?? null,
      location: s.location ?? null,
      tags: s.tags ?? null,
    }));

    const { data: inserted, error } = await supabase.from("health_events").insert(rows).select();
    if (error) throw new Error(error.message);

    // Ingest each into Hydra (best effort; do not block)
    let ingested = 0;
    for (const row of inserted ?? []) {
      try {
        await ingestMemory({
          userId,
          id: row.id,
          text: `${row.event_date} — ${row.event_type}: ${row.title}.${row.description ? ` ${row.description}` : ""}`,
          metadata: { eventId: row.id, provider: row.provider, tags: row.tags },
          source: "demo:seed",
        });
        ingested++;
      } catch (err) {
        console.warn("[demo seed ingest]", err);
      }
    }

    return { inserted: inserted?.length ?? 0, ingested };
  });
