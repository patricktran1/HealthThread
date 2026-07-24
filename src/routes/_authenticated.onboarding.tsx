import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Disclaimer } from "@/components/disclaimer";
import { hydraWriteMemory } from "@/lib/mock-apis";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Onboarding · HealthThread" }] }),
  component: Onboarding,
});

type Form = {
  full_name: string;
  date_of_birth: string;
  sex: string;
  blood_type: string;
  height_cm: string;
  weight_kg: string;
  allergies: string;
  medications: string;
  conditions: string;
  emergency_contact: string;
};

const empty: Form = {
  full_name: "", date_of_birth: "", sex: "", blood_type: "",
  height_cm: "", weight_kg: "", allergies: "", medications: "",
  conditions: "", emergency_contact: "",
};

function Onboarding() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) {
        setForm({
          full_name: data.full_name ?? "",
          date_of_birth: data.date_of_birth ?? "",
          sex: data.sex ?? "",
          blood_type: data.blood_type ?? "",
          height_cm: data.height_cm?.toString() ?? "",
          weight_kg: data.weight_kg?.toString() ?? "",
          allergies: data.allergies ?? "",
          medications: data.medications ?? "",
          conditions: data.conditions ?? "",
          emergency_contact: data.emergency_contact ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const payload = {
        id: u.user.id,
        full_name: form.full_name || null,
        date_of_birth: form.date_of_birth || null,
        sex: form.sex || null,
        blood_type: form.blood_type || null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        allergies: form.allergies || null,
        medications: form.medications || null,
        conditions: form.conditions || null,
        emergency_contact: form.emergency_contact || null,
        onboarded: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").upsert(payload);
      if (error) throw error;
      await hydraWriteMemory({
        source: "ui:onboarding",
        userId: u.user.id,
        kind: "profile",
        text: `Profile updated. Allergies: ${form.allergies}. Medications: ${form.medications}. Conditions: ${form.conditions}.`,
      });
      toast.success("Profile saved");
      navigate({ to: "/log" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your health profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few basics so HealthThread can give you a more useful summary. Everything is private to you.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full name"><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
          <Field label="Sex"><Input value={form.sex} onChange={(e) => set("sex", e.target.value)} placeholder="e.g. Female" /></Field>
          <Field label="Blood type"><Input value={form.blood_type} onChange={(e) => set("blood_type", e.target.value)} placeholder="e.g. O+" /></Field>
          <Field label="Height (cm)"><Input type="number" value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} /></Field>
          <Field label="Weight (kg)"><Input type="number" value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} /></Field>
        </div>
        <Field label="Allergies"><Textarea rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. Penicillin (rash)" /></Field>
        <Field label="Current medications"><Textarea rows={2} value={form.medications} onChange={(e) => set("medications", e.target.value)} placeholder="Name, dose, frequency" /></Field>
        <Field label="Ongoing conditions"><Textarea rows={2} value={form.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="e.g. Asthma, Hypothyroidism" /></Field>
        <Field label="Emergency contact"><Input value={form.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value)} placeholder="Name · relationship · phone" /></Field>

        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
        </div>
        <Disclaimer />
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
