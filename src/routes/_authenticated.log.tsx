import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Calendar, MapPin, User as UserIcon, Tag, Pencil, Trash2, Paperclip } from "lucide-react";
import { Disclaimer } from "@/components/disclaimer";
import { hydraDeleteMemory } from "@/lib/mock-apis";
import { openDocument } from "@/lib/document-url";
import { InsightsCard } from "@/components/insights-card";
import { DemoSeedButton } from "@/components/demo-seed-button";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({ meta: [{ title: "Memory log · HealthThread" }] }),
  component: LogPage,
});

type Event = {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  provider: string | null;
  location: string | null;
  tags: string[] | null;
  source_document_path: string | null;
};

function LogPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function reloadEvents() {
    const { data } = await supabase
      .from("health_events")
      .select("*")
      .order("event_date", { ascending: false });
    setEvents((data as Event[]) ?? []);
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    supabase
      .from("health_events")
      .select("*")
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as Event[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("health_events").delete().eq("id", id);
      if (error) throw error;
      await hydraDeleteMemory([id], "ui:log_delete");
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success("Event deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete event");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = events.filter((e) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      e.title.toLowerCase().includes(t) ||
      e.description?.toLowerCase().includes(t) ||
      e.event_type.toLowerCase().includes(t) ||
      e.provider?.toLowerCase().includes(t) ||
      e.tags?.some((x) => x.toLowerCase().includes(t))
    );
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memory log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your timeline, most recent first.</p>
        </div>
        <div className="flex items-center gap-2">
          <DemoSeedButton onSeeded={reloadEvents} />
          <Link to="/add-event">
            <Button><Plus className="mr-1.5 h-4 w-4" /> Add event</Button>
          </Link>
        </div>
      </div>

      <InsightsCard refreshKey={refreshKey} />

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your history…" className="pl-9" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{events.length === 0 ? "Your thread is empty. Add your first health event." : "No matching events."}</p>
          {events.length === 0 && (
            <Link to="/add-event" className="mt-4 inline-block">
              <Button><Plus className="mr-1.5 h-4 w-4" /> Add first event</Button>
            </Link>
          )}
        </div>
      ) : (
        <ol className="space-y-3">
          {filtered.map((e) => (
            <li key={e.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                      {e.event_type}
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(e.event_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    {e.provider ? <span className="inline-flex items-center gap-1 text-muted-foreground"><UserIcon className="h-3 w-3" />{e.provider}</span> : null}
                    {e.location ? <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" />{e.location}</span> : null}
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{e.title}</h3>
                  {e.description ? <p className="mt-1 text-sm text-muted-foreground">{e.description}</p> : null}
                  {e.tags?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {e.tags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                          <Tag className="h-3 w-3" />{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {e.source_document_path ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="View source document"
                      onClick={() =>
                        openDocument(e.source_document_path!).catch((err) =>
                          toast.error(err instanceof Error ? err.message : "Could not open file"),
                        )
                      }
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Link to="/edit-event/$id" params={{ id: e.id }}>
                    <Button variant="ghost" size="icon" aria-label="Edit event">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Delete event" disabled={deletingId === e.id}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes "{e.title}" from your thread and from the AI's memory. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(e.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Disclaimer className="mt-8" />
    </div>
  );
}
