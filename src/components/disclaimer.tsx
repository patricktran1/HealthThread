import { ShieldCheck } from "lucide-react";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground ${className}`}
    >
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <p>
        HealthThread helps you remember, organize, and communicate your medical history. It does
        not diagnose, treat, or replace a licensed clinician.
      </p>
    </div>
  );
}
