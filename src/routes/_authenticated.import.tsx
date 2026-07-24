import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Disclaimer } from "@/components/disclaimer";
import { FileUp, Loader2, Trash2, Image as ImageIcon, FileText } from "lucide-react";
import { extractPdfEventsFn, type ExtractedEventDto } from "@/lib/pdf-extract.functions";
import { extractPhotoEventsFn } from "@/lib/photo-extract.functions";
import { hydraWriteMemory } from "@/lib/mock-apis";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import document · HealthThread" }] }),
  component: ImportDoc,
});

const TYPES = [
  "Visit",
  "Lab result",
  "Medication",
  "Symptom",
  "Procedure",
  "Vaccination",
  "Imaging",
  "Other",
];

type Draft = ExtractedEventDto & { _key: string };

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // chunked to avoid call-stack issues on large files
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function ImportDoc() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const kind: "pdf" | "image" | null = !file
    ? null
    : file.type === "application/pdf"
      ? "pdf"
      : IMAGE_MIME.has(file.type)
        ? "image"
        : null;

  async function onExtract() {
    if (!file) return;
    if (!kind) {
      toast.error("Upload a PDF or an image (JPG, PNG, WEBP, HEIC).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is over 10MB. Please upload a smaller one.");
      return;
    }
    setExtracting(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const { events } =
        kind === "pdf"
          ? await extractPdfEventsFn({ data: { fileBase64 } })
          : await extractPhotoEventsFn({ data: { fileBase64, mimeType: file.type } });
      if (events.length === 0) {
        toast.warning("No events found in this document.");
      } else {
        toast.success(`Found ${events.length} event${events.length === 1 ? "" : "s"}.`);
      }
      setDrafts(events.map((e, i) => ({ ...e, _key: `${Date.now()}-${i}` })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse the file.");
    } finally {
      setExtracting(false);
    }
  }

  function update(idx: number, patch: Partial<Draft>) {
    setDrafts((d) => d.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function remove(idx: number) {
    setDrafts((d) => d.filter((_, i) => i !== idx));
  }

  async function saveAll() {
    if (drafts.length === 0 || !file) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      // Upload the source PDF once, scoped under userId/
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${u.user.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("health-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) throw upErr;

      const rows = drafts.map((d) => ({
        user_id: u.user!.id,
        event_date: d.event_date,
        event_type: d.event_type,
        title: d.title,
        description: d.description || null,
        provider: d.provider || null,
        location: d.location || null,
        tags: d.tags && d.tags.length ? d.tags : null,
        source_document_path: path,
      }));

      const { data: inserted, error } = await supabase
        .from("health_events")
        .insert(rows)
        .select();
      if (error) throw error;

      // Index each new event in Hydra memory
      await Promise.all(
        (inserted ?? []).map((row) =>
          hydraWriteMemory({
            source: "import:document",
            id: row.id,
            userId: u.user!.id,
            kind: "event",
            text: `${row.event_date} — ${row.event_type}: ${row.title}.${row.description ? ` ${row.description}` : ""}`,
            metadata: { eventId: row.id, provider: row.provider, source: safeName },
          }),
        ),
      );

      toast.success(`Saved ${rows.length} event${rows.length === 1 ? "" : "s"} to your thread.`);
      navigate({ to: "/log" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save events.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Import from a document or photo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a PDF (after-visit summary, lab report) or a photo of a printout, prescription bottle, or handwritten note. I'll extract events for you to review before saving.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <Label className="block text-sm font-medium">PDF or image</Label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setDrafts([]);
            }}
            className="max-w-md"
          />
          <Button onClick={onExtract} disabled={!file || extracting || !kind}>
            {extracting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading…
              </>
            ) : (
              <>
                <FileUp className="mr-2 h-4 w-4" /> Extract events
              </>
            )}
          </Button>
        </div>
        {file && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            {kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {file.name} · {(file.size / 1024).toFixed(0)} KB
            {!kind && <span className="text-destructive"> · unsupported type</span>}
          </p>
        )}
      </div>

      {drafts.length > 0 && (
        <>
          <div className="mt-8 mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review extracted events</h2>
            <p className="text-xs text-muted-foreground">{drafts.length} found</p>
          </div>

          <ul className="space-y-4">
            {drafts.map((d, i) => (
              <li key={d._key} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Event {i + 1}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={d.event_date}
                      onChange={(e) => update(i, { event_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select
                      value={d.event_type}
                      onChange={(e) => update(i, { event_type: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label>Title</Label>
                  <Input value={d.title} onChange={(e) => update(i, { title: e.target.value })} />
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    value={d.description ?? ""}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Provider</Label>
                    <Input
                      value={d.provider ?? ""}
                      onChange={(e) => update(i, { provider: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <Input
                      value={d.location ?? ""}
                      onChange={(e) => update(i, { location: e.target.value })}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrafts([])}>
              Discard
            </Button>
            <Button onClick={saveAll} disabled={saving}>
              {saving ? "Saving…" : `Save ${drafts.length} event${drafts.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}

      <Disclaimer className="mt-6" />
    </div>
  );
}
