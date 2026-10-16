import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckSquare,
  Gauge,
  LayoutDashboard,
  Settings,
  Target,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackupRaw, hydrateStore, type RecoveryNotice } from "@/lib/store";

const NAV = [
  { to: "/", label: "Today", icon: LayoutDashboard },
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/focus", label: "Focus", icon: Timer },
  { to: "/progress", label: "Progress", icon: Gauge },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<RecoveryNotice | null>(null);
  useEffect(() => {
    hydrateStore()
      // Only set when present: a second (dev StrictMode) run finds nothing left to report.
      .then((n) => n && setNotice(n))
      .catch((e) => console.error("Failed to load saved data", e))
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:flex md:flex-col">
        <div className="px-5 py-6">
          <div className="font-display text-lg font-semibold">
            A/L <span className="text-primary">Command</span>
          </div>
          <div className="text-xs text-muted-foreground">Center</div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-5 py-4 text-[11px] leading-snug text-muted-foreground">
          Data is stored in this browser only. Export backups in Settings.
        </p>
      </aside>

      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
          {ready ? (
            <>
              {notice && <RecoveryBanner notice={notice} onDismiss={() => setNotice(null)} />}
              {children}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t bg-sidebar md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground data-[status=active]:text-primary"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const RECOVERY_TITLE: Record<RecoveryNotice["reason"], string> = {
  corrupt: "Your saved data couldn't be read, so the app started fresh.",
  invalid: "Your saved data couldn't be used, so the app started fresh.",
  repaired: "Some saved data was invalid and was skipped or repaired.",
};

function downloadOriginalData() {
  const raw = getBackupRaw();
  if (!raw) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  a.download = `al-command-center-original-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function RecoveryBanner({ notice, onDismiss }: { notice: RecoveryNotice; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-md border border-warning/50 bg-warning/10 p-4 text-sm"
    >
      <p className="mb-1 font-medium">{RECOVERY_TITLE[notice.reason]}</p>
      <ul className="mb-2 list-disc pl-5 text-muted-foreground">
        {notice.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="mb-3 text-muted-foreground">
        A copy of the original data was kept in this browser. Download it before making changes if
        you need anything back.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={downloadOriginalData}>
          Download original data
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ComingSoon({ stage }: { stage: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      Arrives in {stage}.
    </div>
  );
}
