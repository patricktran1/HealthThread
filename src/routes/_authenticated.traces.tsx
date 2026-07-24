import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Database,
  Search,
  Trash2,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/traces")({
  head: () => ({ meta: [{ title: "HydraDB traces · HealthThread" }] }),
  component: TracesPage,
});

type Trace = {
  id: string;
  user_id: string;
  operation: "write" | "query" | "delete" | string;
  source: string;
  query: string | null;
  request: unknown;
  response: unknown;
  status: "ok" | "error" | string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

const OP_ICON: Record<string, typeof Database> = {
  write: Database,
  query: Search,
  delete: Trash2,
};

function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "write" | "query" | "delete" | "error">("all");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("hydra_traces")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setTraces((data as Trace[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("hydra_traces_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hydra_traces" },
        (payload) => {
          setTraces((prev) => [payload.new as Trace, ...prev].slice(0, 200));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const s = { total: traces.length, write: 0, query: 0, delete: 0, error: 0 };
    for (const t of traces) {
      if (t.operation === "write") s.write++;
      else if (t.operation === "query") s.query++;
      else if (t.operation === "delete") s.delete++;
      if (t.status === "error") s.error++;
    }
    return s;
  }, [traces]);

  const filtered = useMemo(() => {
    return traces.filter((t) => {
      if (filter === "error" && t.status !== "error") return false;
      if (filter !== "all" && filter !== "error" && t.operation !== filter) return false;
      if (q) {
        const hay = `${t.source} ${t.query ?? ""} ${t.error ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [traces, filter, q]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">HydraDB traces</h1>
          <p className="text-sm text-muted-foreground">
            Live log of every read and write the agent performs against HydraDB. Use this to verify
            the agent is autonomously persisting and recalling your memory.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Writes" value={stats.write} />
        <Stat label="Queries" value={stats.query} />
        <Stat label="Deletes" value={stats.delete} />
        <Stat label="Errors" value={stats.error} tone={stats.error > 0 ? "error" : "default"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "write", "query", "delete", "error"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
        <Input
          placeholder="Filter by source, query, or error…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No traces match. Try a different filter, or trigger an action (log an event, ask the chat
          a question).
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {filtered.map((t) => {
            const Icon = OP_ICON[t.operation] ?? Database;
            const isOpen = expanded.has(t.id);
            return (
              <div key={t.id} className="text-sm">
                <button
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="w-16 shrink-0 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    {t.operation}
                  </span>
                  {t.status === "error" ? (
                    <Badge variant="destructive" className="shrink-0">
                      <AlertCircle className="mr-1 h-3 w-3" /> error
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      ok
                    </Badge>
                  )}
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {t.source}
                  </span>
                  <span className="flex-1 truncate text-foreground">
                    {t.query ?? t.error ?? "—"}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {t.duration_ms != null ? `${t.duration_ms}ms` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                </button>
                {isOpen ? (
                  <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3">
                    {t.error ? (
                      <Block label="Error">
                        <pre className="whitespace-pre-wrap break-words text-xs text-destructive">
                          {t.error}
                        </pre>
                      </Block>
                    ) : null}
                    <Block label="Request">
                      <JsonPre value={t.request} />
                    </Block>
                    <Block label="Response">
                      <JsonPre value={t.response} />
                    </Block>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "error";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-semibold tabular-nums ${tone === "error" && value > 0 ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function JsonPre({ value }: { value: unknown }) {
  if (value == null) return <div className="text-xs text-muted-foreground">null</div>;
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="max-h-80 overflow-auto rounded border border-border bg-background p-3 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  );
}
