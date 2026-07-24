import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclaimer } from "@/components/disclaimer";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, ExternalLink, Trash2, Search, FileUp } from "lucide-react";
import { fileNameFromPath, inferKindFromPath, openDocument } from "@/lib/document-url";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents · HealthThread" }] }),
  component: DocumentsPage,
});

type Doc = {
  path: string;
  name: string;
  size: number;
  updatedAt: string;
  kind: "pdf" | "image" | "other";
  eventCount: number;
};

function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const folder = u.user.id;
      const { data: files, error } = await supabase.storage
        .from("health-documents")
        .list(folder, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
      if (error) throw error;

      const paths = (files ?? []).filter((f) => f.name).map((f) => `${folder}/${f.name}`);

      // Count events per source_document_path
      const { data: events } = await supabase
        .from("health_events")
        .select("source_document_path")
        .in("source_document_path", paths.length ? paths : ["__none__"]);
      const counts = new Map<string, number>();
      (events ?? []).forEach((e) => {
        if (!e.source_document_path) return;
        counts.set(e.source_document_path, (counts.get(e.source_document_path) ?? 0) + 1);
      });

      const rows: Doc[] = (files ?? [])
        .filter((f) => f.name)
        .map((f) => {
          const path = `${folder}/${f.name}`;
          return {
            path,
            name: fileNameFromPath(path),
            size: (f.metadata as { size?: number } | null)?.size ?? 0,
            updatedAt: f.updated_at ?? f.created_at ?? "",
            kind: inferKindFromPath(path),
            eventCount: counts.get(path) ?? 0,
          };
        });
      setDocs(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpen(path: string) {
    try {
      await openDocument(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file");
    }
  }

  async function handleDelete(path: string) {
    setDeleting(path);
    try {
      const { error } = await supabase.storage.from("health-documents").remove([path]);
      if (error) throw error;
      // Clear references on events (keep the events, drop the link)
      await supabase
        .from("health_events")
        .update({ source_document_path: null })
        .eq("source_document_path", path);
      setDocs((d) => d.filter((x) => x.path !== path));
      toast.success("Document deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = docs.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Original PDFs and photos you've uploaded. Stored privately — only you can view them.
          </p>
        </div>
        <Link to="/import">
          <Button>
            <FileUp className="mr-1.5 h-4 w-4" /> Import new
          </Button>
        </Link>
      </div>

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search filenames…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {docs.length === 0 ? "No documents yet. Upload from Import." : "No matching files."}
          </p>
          {docs.length === 0 && (
            <Link to="/import" className="mt-4 inline-block">
              <Button>
                <FileUp className="mr-1.5 h-4 w-4" /> Import a document
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((d) => {
            const Icon = d.kind === "image" ? ImageIcon : FileText;
            return (
              <li
                key={d.path}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(d.size / 1024).toFixed(0)} KB · {d.eventCount} linked event
                    {d.eventCount === 1 ? "" : "s"}
                    {d.updatedAt ? ` · ${new Date(d.updatedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleOpen(d.path)}>
                  <ExternalLink className="mr-1.5 h-4 w-4" /> View
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete document"
                      disabled={deleting === d.path}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Removes the original file. Any events extracted from it stay in your log,
                        but lose the link to the source.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(d.path)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            );
          })}
        </ul>
      )}

      <Disclaimer className="mt-8" />
    </div>
  );
}
