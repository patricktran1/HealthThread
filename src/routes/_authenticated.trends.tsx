import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Disclaimer } from "@/components/disclaimer";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/trends")({
  head: () => ({ meta: [{ title: "Trends · HealthThread" }] }),
  component: TrendsPage,
});

type Event = {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  description: string | null;
  tags: string[] | null;
};

type Metric = { date: string; value: number; label: string };

// Parse "120/80" blood pressure
function parseBP(text: string): { systolic: number; diastolic: number } | null {
  const m = text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
  if (!m) return null;
  const s = +m[1], d = +m[2];
  if (s < 60 || s > 250 || d < 30 || d > 160) return null;
  return { systolic: s, diastolic: d };
}

// Parse weight: "72 kg", "158 lb", "158.5 lbs"
function parseWeight(text: string): number | null {
  const kg = text.match(/(\d{2,3}(?:\.\d+)?)\s*kg\b/i);
  if (kg) return +kg[1];
  const lb = text.match(/(\d{2,3}(?:\.\d+)?)\s*lbs?\b/i);
  if (lb) return +(+lb[1] * 0.453592).toFixed(1);
  return null;
}

// Parse temperature: "101.2 F", "38.5 C"
function parseTemp(text: string): number | null {
  const f = text.match(/(\d{2,3}(?:\.\d+)?)\s*°?\s*F\b/i);
  if (f) return +(((+f[1] - 32) * 5) / 9).toFixed(1);
  const c = text.match(/(\d{2,3}(?:\.\d+)?)\s*°?\s*C\b/i);
  if (c) return +(+c[1]);
  return null;
}

function fmtMonth(d: string) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function TrendsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("health_events")
      .select("id,event_date,event_type,title,description,tags")
      .order("event_date", { ascending: true })
      .then(({ data }) => {
        setEvents((data as Event[]) ?? []);
        setLoading(false);
      });
  }, []);

  const { bpData, weightData, tempData, byMonth, types, totalsByType } = useMemo(() => {
    const bp: Array<{ date: string; systolic: number; diastolic: number }> = [];
    const w: Metric[] = [];
    const t: Metric[] = [];
    const monthMap = new Map<string, Record<string, number>>();
    const typeSet = new Set<string>();
    const totals: Record<string, number> = {};

    for (const e of events) {
      const text = `${e.title} ${e.description ?? ""}`;
      const b = parseBP(text);
      if (b) bp.push({ date: e.event_date, ...b });
      const wv = parseWeight(text);
      if (wv) w.push({ date: e.event_date, value: wv, label: e.title });
      const tv = parseTemp(text);
      if (tv) t.push({ date: e.event_date, value: tv, label: e.title });

      const month = fmtMonth(e.event_date);
      const type = e.event_type || "other";
      typeSet.add(type);
      totals[type] = (totals[type] ?? 0) + 1;
      const row = monthMap.get(month) ?? {};
      row[type] = (row[type] ?? 0) + 1;
      monthMap.set(month, row);
    }

    const months = Array.from(monthMap.keys()).sort();
    const byMonthArr = months.map((m) => ({ month: m, ...monthMap.get(m) }));
    return {
      bpData: bp,
      weightData: w,
      tempData: t,
      byMonth: byMonthArr,
      types: Array.from(typeSet).sort(),
      totalsByType: Object.entries(totals).sort((a, b) => b[1] - a[1]),
    };
  }, [events]);

  const typeColors = [
    "hsl(var(--primary))",
    "hsl(var(--chart-2, 200 70% 50%))",
    "hsl(var(--chart-3, 280 60% 55%))",
    "hsl(var(--chart-4, 30 80% 55%))",
    "hsl(var(--chart-5, 340 70% 55%))",
    "hsl(var(--chart-6, 150 60% 45%))",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>
        <p className="text-sm text-muted-foreground">
          Patterns extracted from your logged events. Numeric values like blood pressure, weight, and temperature are detected automatically from titles and descriptions.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No events yet. Log a few entries to see trends here.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <ChartCard title="Events per month by type" empty={byMonth.length === 0}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {types.map((tp, i) => (
                  <Bar key={tp} dataKey={tp} stackId="a" fill={typeColors[i % typeColors.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Event totals" empty={totalsByType.length === 0}>
            <ul className="space-y-2 p-2">
              {totalsByType.map(([type, count], i) => (
                <li key={type} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: typeColors[i % typeColors.length] }} />
                    <span className="capitalize">{type}</span>
                  </span>
                  <span className="font-medium tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

          <ChartCard title="Blood pressure" empty={bpData.length === 0} hint="Detected from values like 120/80">
            {bpData.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={bpData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={["dataMin - 10", "dataMax + 10"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="systolic" stroke={typeColors[0]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="diastolic" stroke={typeColors[1]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Weight (kg)" empty={weightData.length === 0} hint="Detected from values like 72 kg or 158 lb">
            {weightData.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke={typeColors[2]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Temperature (°C)" empty={tempData.length === 0} hint="Detected from values like 38.5 C or 101.2 F">
            {tempData.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tempData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={["dataMin - 0.5", "dataMax + 0.5"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke={typeColors[3]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

function ChartCard({ title, children, empty, hint }: { title: string; children: React.ReactNode; empty?: boolean; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {empty ? (
        <div className="grid h-[220px] place-items-center text-xs text-muted-foreground">No data yet</div>
      ) : (
        children
      )}
    </div>
  );
}
