import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateInsightsFn, type Insight } from "@/lib/insights.functions";

export function InsightsCard({ refreshKey }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { insights } = await generateInsightsFn();
      setInsights(insights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate insights");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight">Memory insights</h2>
          <span className="text-xs text-muted-foreground">AI-generated from your thread</span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : insights.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add a few more events and I'll start surfacing patterns.
        </p>
      ) : (
        <ul className="space-y-2">
          {insights.map((ins, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/60 bg-background/60 p-3"
            >
              <div className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{ins.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ins.detail}</p>
                  {ins.evidence?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {ins.evidence.map((ev, j) => (
                        <li
                          key={j}
                          className="text-[11px] text-muted-foreground/80"
                        >
                          ↳ {ev}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
