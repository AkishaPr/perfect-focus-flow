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
import { ThemeToggle } from "@/components/ThemeToggle";
import { TimerDock } from "@/components/TimerDock";
import { hydrateTimer } from "@/lib/focus/store";
import { getBackupRaw, hydrateStore, type RecoveryNotice } from "@/lib/store";

const NAV = [
  { to: "/", label: "Today", icon: LayoutDashboard },
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/focus", label: "Focus", icon: Timer },
  { to: "/progress", label: "Progress", icon: Gauge },
] as const;
const SETTINGS_ITEM = { to: "/settings", label: "Settings", icon: Settings } as const;
const MOBILE_NAV = [...NAV, SETTINGS_ITEM] as const;

const NAV_LINK = "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors";
const NAV_ACTIVE = "bg-sidebar-primary font-medium text-sidebar-primary-foreground";
const NAV_IDLE =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<RecoveryNotice | null>(null);
  useEffect(() => {
    Promise.all([hydrateStore(), hydrateTimer()])
      // Only set when present: a second (dev StrictMode) run finds nothing left to report.
      .then(([n]) => n && setNotice(n))
      .catch((e) => console.error("Failed to load saved data", e))
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:sticky md:top-0 md:flex md:h-screen">
        <div className="flex items-center gap-3 px-2 pb-6 pt-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar-primary font-display text-[13px] font-semibold text-sidebar-primary-foreground">
            A/L
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold leading-tight">Command Center</div>
            <div className="text-xs text-muted-foreground">Maths · Physics · ICT</div>
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className={NAV_LINK}
              activeProps={{ className: NAV_ACTIVE }}
              inactiveProps={{ className: NAV_IDLE }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 pt-4">
          <Link
            to={SETTINGS_ITEM.to}
            className={NAV_LINK}
            activeProps={{ className: NAV_ACTIVE }}
            inactiveProps={{ className: NAV_IDLE }}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            {SETTINGS_ITEM.label}
          </Link>
          <ThemeToggle />
          <p className="px-2 text-[11px] leading-snug text-muted-foreground">
            Data is stored in this browser only. Export backups in Settings.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
          {ready ? (
            <>
              {notice && <RecoveryBanner notice={notice} onDismiss={() => setNotice(null)} />}
              {children}
              <TimerDock />
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t bg-sidebar md:hidden"
      >
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground data-[status=active]:font-semibold data-[status=active]:text-sidebar-primary"
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
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
        <h1 className="text-3xl font-medium">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ComingSoon({ stage }: { stage: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
      Arrives in {stage}.
    </div>
  );
}
