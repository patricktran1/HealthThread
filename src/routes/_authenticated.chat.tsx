import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, Wrench, Check, Plus, X, Calendar, FileText, Database, Search, Pencil, Trash2 } from "lucide-react";
import { Disclaimer } from "@/components/disclaimer";
import { chatAgentFn, type ChatToolEvent, type SuggestedEvent } from "@/lib/chat-agent.functions";
import { hydraWriteMemory } from "@/lib/mock-apis";
import { MicButton } from "@/components/mic-button";
import { toast } from "sonner";

type LiveTrace = {
  id: string;
  operation: string;
  source: string;
  query: string | null;
  status: string;
  duration_ms: number | null;
};

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Chat · HealthThread" }] }),
  component: Chat,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ChatToolEvent[];
  /** suggestion key (per message) → state */
  suggestionState?: Record<number, "pending" | "saved" | "dismissed">;
};

function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [liveTraces, setLiveTraces] = useState<LiveTrace[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("chat_messages")
      .select("id, role, content")
      .order("created_at")
      .then(({ data }) => {
        if (data) setMessages(data as Msg[]);
      });
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function saveSuggestion(msgId: string, idx: number, s: SuggestedEvent) {
    const key = `${msgId}:${idx}`;
    setSavingKey(key);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("health_events")
        .insert({
          user_id: u.user.id,
          event_date: s.event_date,
          event_type: s.event_type,
          title: s.title,
          description: s.description ?? null,
          provider: s.provider ?? null,
          location: s.location ?? null,
          tags: s.tags && s.tags.length ? s.tags : null,
        })
        .select()
        .single();
      if (error) throw error;
      await hydraWriteMemory({
        source: "ui:chat_suggestion_accept",
        id: data.id,
        userId: u.user.id,
        kind: "event",
        text: `${s.event_date} — ${s.event_type}: ${s.title}.${s.description ? ` ${s.description}` : ""}`,
        metadata: { eventId: data.id, provider: s.provider, tags: s.tags },
      });
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId
            ? { ...m, suggestionState: { ...(m.suggestionState ?? {}), [idx]: "saved" } }
            : m,
        ),
      );
      toast.success("Saved to your thread");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingKey(null);
    }
  }

  function dismissSuggestion(msgId: string, idx: number) {
    setMessages((all) =>
      all.map((m) =>
        m.id === msgId
          ? { ...m, suggestionState: { ...(m.suggestionState ?? {}), [idx]: "dismissed" } }
          : m,
      ),
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setLiveTraces([]);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    await supabase.from("chat_messages").insert({ user_id: u.user.id, role: "user", content: text });

    // Live agent trace: poll hydra_traces while the agent works.
    const sendStart = new Date().toISOString();
    const userId = u.user.id;
    const pollHandle = window.setInterval(async () => {
      const { data: rows } = await supabase
        .from("hydra_traces")
        .select("id, operation, source, query, status, duration_ms")
        .eq("user_id", userId)
        .gte("created_at", sendStart)
        .order("created_at", { ascending: true })
        .limit(20);
      if (rows && rows.length > 0) setLiveTraces(rows as LiveTrace[]);
    }, 700);

    try {
      const { text: reply, toolEvents } = await chatAgentFn({
        data: { history, userMessage: text },
      });
      const aMsg: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply || "(no response)",
        tools: toolEvents,
      };
      setMessages((m) => [...m, aMsg]);
      await supabase
        .from("chat_messages")
        .insert({ user_id: u.user.id, role: "assistant", content: aMsg.content });
    } catch (err) {
      const aMsg: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`,
      };
      setMessages((m) => [...m, aMsg]);
    } finally {
      window.clearInterval(pollHandle);
      setBusy(false);
      setLiveTraces([]);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ height: "calc(100vh - 8rem)" }}>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Chat with your health memory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about your history, or just say "log a headache today" and I'll save it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-soft">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
            <div>
              <MessageCircle className="mx-auto mb-3 h-8 w-8 text-primary" />
              <p>Try: "I've had a headache for 3 days" or "When was my last lab?"</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const suggestions =
                m.tools
                  ?.map((t, i) => ({ tool: t, idx: i }))
                  .filter((x) => x.tool.name === "suggest_log_event" && x.tool.suggestion) ?? [];
              const chips =
                m.tools?.filter((t) => t.name !== "suggest_log_event") ?? [];

              return (
                <li key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                        : "max-w-[85%] whitespace-pre-wrap text-sm text-foreground"
                    }
                  >
                    {chips.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {chips.map((t, i) => (
                          <div
                            key={i}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground mr-1"
                          >
                            <Wrench className="h-3 w-3" />
                            <span className="font-medium">{t.name}</span>
                            <span className="text-muted-foreground/80">· {t.summary}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {m.content}

                    {suggestions.map(({ tool, idx }) => {
                      const s = tool.suggestion!;
                      const state = m.suggestionState?.[idx] ?? "pending";
                      const key = `${m.id}:${idx}`;
                      const saving = savingKey === key;
                      return (
                        <div
                          key={idx}
                          className="mt-3 rounded-xl border border-border bg-background/60 p-3"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                              {s.event_type}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(s.event_date).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-foreground">{s.title}</p>
                          {s.description && (
                            <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                              <FileText className="mt-0.5 h-3 w-3 shrink-0" /> {s.description}
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            {state === "saved" ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                <Check className="h-3.5 w-3.5" /> Saved to your thread
                              </span>
                            ) : state === "dismissed" ? (
                              <span className="text-xs text-muted-foreground">Dismissed</span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => saveSuggestion(m.id, idx, s)}
                                  disabled={saving}
                                >
                                  <Plus className="mr-1 h-3.5 w-3.5" />
                                  {saving ? "Saving…" : `Log this ${s.event_type.toLowerCase()}`}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => dismissSuggestion(m.id, idx)}
                                  disabled={saving}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" /> Dismiss
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
            {busy && (
              <li>
                <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <Database className="h-3.5 w-3.5 animate-pulse" />
                    Agent thinking
                    <span className="inline-flex gap-0.5">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-primary" />
                    </span>
                  </div>
                  {liveTraces.length === 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">Reasoning over your memory…</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {liveTraces.map((t) => {
                        const Icon =
                          t.operation === "query"
                            ? Search
                            : t.operation === "write"
                              ? Pencil
                              : t.operation === "delete"
                                ? Trash2
                                : Database;
                        return (
                          <li key={t.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Icon className="h-3 w-3 text-primary" />
                            <span className="font-mono uppercase text-foreground">{t.operation}</span>
                            <span className="text-muted-foreground/70">· {t.source}</span>
                            {t.query && (
                              <span className="truncate italic">"{t.query.slice(0, 60)}"</span>
                            )}
                            {t.duration_ms != null && (
                              <span className="ml-auto text-muted-foreground/60">{t.duration_ms}ms</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </li>
            )}
            <div ref={endRef} />
          </ul>
        )}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <MicButton
          disabled={busy}
          onTranscript={(t) => {
            setInput((cur) => (cur ? `${cur} ${t}` : t));
            inputRef.current?.focus();
          }}
        />
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, or speak with the mic…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <Disclaimer className="mt-3" />
    </div>
  );
}
