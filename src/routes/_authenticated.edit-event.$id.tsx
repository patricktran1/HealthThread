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
import { fileNameFromPath, inferKindFromPath, openDocument } from "@/lib/document-url";
import { Paperclip, ExternalLink, X, FileText, Image as ImageIcon, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/edit-event/$id")({
  head: () => ({ meta: [{ title: "Edit event · HealthThread" }] }),
  component: EditEvent,
});

const TYPES = ["Visit", "Lab result", "Medication", "Symptom", "Procedure", "Vaccination", "Imaging", "Other"];
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

function EditEvent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [f, setF] = useState({
    event_date: "",
    event_type: "Visit",
    title: "",
    description: "",
    provider: "",
    location: "",
    tags: "",
  });

  useEffect(() => {
    supabase
      .from("health_events")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("Event not found");
          navigate({ to: "/log" });
          return;
        }
        setF({
          event_date: data.event_date,
          event_type: data.event_type,
          title: data.title,
          description: data.description ?? "",
          provider: data.provider ?? "",
          location: data.location ?? "",
          tags: (data.tags ?? []).join(", "),
        });
        setSourcePath(data.source_document_path ?? null);
        setLoading(false);
      });
  }, [id, navigate]);

  async function detachSource() {
    if (!sourcePath) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("health_events")
        .update({ source_document_path: null })
        .eq("id", id);
      if (error) throw error;
      setSourcePath(null);
      toast.success("Detached from source document");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not detach");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);

      let newSourcePath = sourcePath;
      if (pendingFile) {
        if (pendingFile.size > 10 * 1024 * 1024) {
          throw new Error("File is over 10MB. Please upload a smaller one.");
        }
        const safe = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${u.user.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("health-documents")
          .upload(path, pendingFile, {
            contentType: pendingFile.type || "application/octet-stream",
          });
        if (upErr) throw upErr;
        newSourcePath = path;
      }

      const { error } = await supabase
        .from("health_events")
        .update({
          event_date: f.event_date,
          event_type: f.event_type,
          title: f.title,
          description: f.description || null,
          provider: f.provider || null,
          location: f.location || null,
          tags: tags.length ? tags : null,
          source_document_path: newSourcePath,
        })
        .eq("id", id);
      if (error) throw error;
      await hydraWriteMemory({
        source: "ui:edit_event",
        id,
        userId: u.user.id,
        kind: "event",
        text: `${f.event_date} — ${f.event_type}: ${f.title}. ${f.description ?? ""}`,
        metadata: { eventId: id, provider: f.provider, tags },
      });
      toast.success("Event updated");
      navigate({ to: "/log" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update event");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const pendingKind = pendingFile ? (pendingFile.type === "application/pdf" ? "pdf" : "image") : null;
  const sourceKind = sourcePath ? inferKindFromPath(sourcePath) : null;
  const SourceIcon = sourceKind === "image" ? ImageIcon : FileText;
  const PendingIcon = pendingKind === "image" ? ImageIcon : FileText;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit event</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update this memory in your thread.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              value={f.event_type}
              onChange={(e) => setF({ ...f, event_type: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Provider / clinician</Label>
            <Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tags (comma separated)</Label>
          <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-background/40 p-4">
          <Label className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Source document</Label>
          {sourcePath ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <SourceIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{fileNameFromPath(sourcePath)}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  openDocument(sourcePath).catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Could not open file"),
                  )
                }
              >
                <ExternalLink className="mr-1.5 h-4 w-4" /> View
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={detachSource} disabled={busy}>
                <X className="mr-1.5 h-4 w-4" /> Detach
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No file attached.</p>
          )}

          <div className="pt-1">
            <Label className="text-xs text-muted-foreground">
              {sourcePath ? "Replace with a new file" : "Attach a PDF or photo"}
            </Label>
            <Input
              type="file"
              accept={ACCEPT}
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              className="mt-1.5"
            />
            {pendingFile && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <PendingIcon className="h-3.5 w-3.5" />
                {pendingFile.name} · {(pendingFile.size / 1024).toFixed(0)} KB · will upload on save
                <Upload className="h-3 w-3" />
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/log" })}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
        <Disclaimer />
      </form>
    </div>
  );
}
