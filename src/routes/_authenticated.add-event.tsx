import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Disclaimer } from "@/components/disclaimer";
import { HEALTH_EVENT_TYPES, normalizeHealthEvent } from "@/lib/health-event";
import { hydraWriteMemory } from "@/lib/mock-apis";

export const Route = createFileRoute("/_authenticated/add-event")({
  head: () => ({ meta: [{ title: "Add event · HealthThread" }] }),
  component: AddEvent,
});

function AddEvent() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    event_date: new Date().toISOString().slice(0, 10),
    event_type: "Visit",
    title: "",
    description: "",
    provider: "",
    location: "",
    tags: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const normalized = normalizeHealthEvent(f);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("health_events")
        .insert({
          user_id: u.user.id,
          event_date: normalized.event_date,
          event_type: normalized.event_type,
          title: normalized.title,
          description: normalized.description,
          provider: normalized.provider,
          location: normalized.location,
          tags: normalized.tags,
        })
        .select()
        .single();
      if (error) throw error;
      await hydraWriteMemory({
        source: "ui:add_event",
        id: data.id,
        userId: u.user.id,
        kind: "event",
        text: normalized.memoryText,
        metadata: {
          eventId: data.id,
          provider: normalized.provider,
          tags: normalized.tags ?? [],
        },
      });
      toast.success("Event added to your thread");
      navigate({ to: "/log" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Add a health event</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A visit, lab, medication, or anything worth remembering.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={f.event_date}
              onChange={(e) => setF({ ...f, event_date: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              value={f.event_type}
              onChange={(e) => setF({ ...f, event_type: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {HEALTH_EVENT_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder="e.g. Annual physical"
            maxLength={160}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={4}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder="Findings, instructions, follow-ups…"
            maxLength={5000}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Provider / clinician</Label>
            <Input
              value={f.provider}
              onChange={(e) => setF({ ...f, provider: e.target.value })}
              placeholder="Dr. Patel"
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={f.location}
              onChange={(e) => setF({ ...f, location: e.target.value })}
              placeholder="Clinic, hospital"
              maxLength={160}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tags (comma separated)</Label>
          <Input
            value={f.tags}
            onChange={(e) => setF({ ...f, tags: e.target.value })}
            placeholder="cardiology, follow-up"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/log" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save event"}
          </Button>
        </div>
        <Disclaimer />
      </form>
    </div>
  );
}
