import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CheckSquare, Gauge, LayoutDashboard, Settings, Target, Timer } from "lucide-react";
import { useStore } from "@/lib/store";

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
  useEffect(() => {
    Promise.resolve(useStore.persist.rehydrate()).then(() => setReady(true));
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
          {ready ? children : <div className="text-sm text-muted-foreground">Loading…</div>}
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

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
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
