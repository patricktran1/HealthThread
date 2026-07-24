import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, MessageCircle, ScrollText, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HealthThread — Your personal medical memory" },
      {
        name: "description",
        content:
          "HealthThread helps you remember, organize, and communicate your medical history. Not a diagnostic tool.",
      },
      { property: "og:title", content: "HealthThread — Your personal medical memory" },
      {
        property: "og:description",
        content:
          "Remember, organize, and communicate your medical history. HealthThread does not diagnose or treat.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">HealthThread</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link to="/auth"><Button size="sm">Get started</Button></Link>
        </div>
      </header>

      <section className="bg-hero">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-soft">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Personal medical memory, designed for clarity
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Your health history,{" "}
              <span className="text-primary">remembered for you.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              HealthThread helps you remember, organize, and communicate your medical history.
              It does not diagnose, treat, or replace a licensed clinician.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/auth"><Button size="lg">Create your thread</Button></Link>
              <Link to="/auth"><Button size="lg" variant="outline">I already have an account</Button></Link>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Private by default · Encrypted at rest
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ScrollText, title: "A clear timeline", body: "Every visit, lab result, and medication change — kept in one calm, searchable thread." },
            { icon: MessageCircle, title: "Chat with your history", body: "Ask 'what did the cardiologist say in March?' and get answers grounded in your own records." },
            { icon: FileText, title: "Doctor-ready summaries", body: "Generate a one-page summary you can hand to any clinician — no rummaging through emails." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card-gradient p-6 shadow-soft">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div className="rounded-3xl bg-primary p-10 text-center text-primary-foreground shadow-card">
          <h2 className="text-2xl font-semibold md:text-3xl">Start your health thread today.</h2>
          <p className="mt-2 text-sm opacity-90 md:text-base">It takes about two minutes to set up.</p>
          <div className="mt-6">
            <Link to="/auth"><Button size="lg" variant="secondary">Get started — free</Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} HealthThread. Not a medical device. Information you store here is for personal organization only.
        </div>
      </footer>
    </div>
  );
}
