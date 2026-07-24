import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { seedDemoDataFn } from "@/lib/demo-seed.functions";
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
import { toast } from "sonner";

export function DemoSeedButton({ onSeeded }: { onSeeded?: () => void }) {
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef<((reset: boolean) => void) | null>(null);

  async function run(reset: boolean) {
    setBusy(true);
    const t = toast.loading(reset ? "Resetting & seeding demo data…" : "Seeding demo data…");
    try {
      const res = await seedDemoDataFn({ data: { reset } });
      toast.success(`Seeded ${res.inserted} events · ${res.ingested} ingested to HydraDB`, {
        id: t,
      });
      onSeeded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seed failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          Demo data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Load demo health history?</AlertDialogTitle>
          <AlertDialogDescription>
            Adds ~14 realistic events (BP readings, recurring headaches, labs, a physical, meds)
            over the last 6 months, and ingests each into HydraDB. Great for live demos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              resolverRef.current = null;
              run(true);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset & seed
          </AlertDialogAction>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              run(false);
            }}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Add to existing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
