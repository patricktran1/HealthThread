import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  MessageCircle,
  Plus,
  FileText,
  ScrollText,
  LogOut,
  User as UserIcon,
  Menu,
  FileUp,
  FolderOpen,
  TrendingUp,
  Database,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/log", label: "Memory log", icon: ScrollText },
  { to: "/add-event", label: "Add event", icon: Plus },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/documents", label: "Documents", icon: FolderOpen },
  { to: "/trends", label: "Trends", icon: TrendingUp },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/summary", label: "Doctor summary", icon: FileText },
  { to: "/traces", label: "Hydra traces", icon: Database },
  { to: "/onboarding", label: "Profile", icon: UserIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/log" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold tracking-tight">HealthThread</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="ml-2 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        {open ? (
          <div className="border-t border-border md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <n.icon className="h-4 w-4 text-primary" />
                  {n.label}
                </Link>
              ))}
              <button
                onClick={signOut}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</main>
    </div>
  );
}
