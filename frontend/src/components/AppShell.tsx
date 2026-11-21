"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, Menu, X, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { ALL_NAV, isActive, MOBILE_TABS, NAV_GROUPS } from "@/lib/nav";
import { STAGES } from "@/lib/format";
import { Wordmark } from "./domain";
import { RequireAuth } from "./RequireAuth";

function NavList({ pathname, compact, onNavigate }: { pathname: string; compact?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <p className={cn("eyebrow mb-1.5 px-3", compact && "md:sr-only lg:not-sr-only")}>{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={label}
                    className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      compact && "md:justify-center lg:justify-start",
                      active ? "bg-career-soft text-career-ink" : "text-ink-soft hover:bg-ink/5 hover:text-ink")}>
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className={cn(compact && "md:sr-only lg:not-sr-only")}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserCard({ compact }: { compact?: boolean }) {
  const { user, profile, logout } = useAuth();
  const router = useRouter();
  const stage = STAGES.find((s) => s.key === profile?.stage)?.label;
  const out = () => { logout(); router.replace("/"); };
  return (
    <div className="border-t border-line pt-4">
      <div className={cn("mb-2 px-3", compact && "md:hidden lg:block")}>
        <p className="truncate text-sm font-semibold">{user?.full_name || user?.email}</p>
        {stage && <p className="text-xs text-ink-faint">Stage: {stage}</p>}
      </div>
      <button type="button" onClick={out} title="Sign out"
        className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5", compact && "md:justify-center lg:justify-start")}>
        <LogOut className="h-[18px] w-[18px]" aria-hidden /><span className={cn(compact && "md:sr-only lg:not-sr-only")}>Sign out</span>
      </button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  const current = ALL_NAV.find((n) => isActive(pathname, n.href));
  const tabs = ALL_NAV.filter((n) => MOBILE_TABS.includes(n.href));

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>

      {/* tablet rail + desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col justify-between overflow-y-auto border-r border-line bg-card/70 px-3 py-5 md:flex md:w-[76px] lg:w-64">
        <div>
          <Link href="/dashboard" className="mb-7 flex items-center px-2 md:justify-center lg:justify-start" aria-label="ACIS home">
            <span className="md:hidden lg:inline"><Wordmark /></span>
            <span className="hidden md:inline lg:hidden"><Wordmark className="[&>span:last-child]:hidden" /></span>
          </Link>
          <NavList pathname={pathname} compact />
        </div>
        <UserCard compact />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/dashboard" aria-label="ACIS home"><Wordmark /></Link>
          <p className="truncate px-3 text-sm font-semibold text-ink-soft">{current?.label}</p>
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-md p-2 text-ink-soft hover:bg-ink/5"><Menu className="h-5 w-5" /></button>
        </header>

        <main id="main" className="page-wrap flex-1 py-6 pb-28 md:py-10 md:pb-12">{children}</main>

        {/* mobile bottom tabs */}
        <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", active ? "text-career-ink" : "text-ink-faint")}>
                <Icon className="h-5 w-5" aria-hidden />{label.split(" ")[0]}
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-ink-faint">
            <MoreHorizontal className="h-5 w-5" aria-hidden />More
          </button>
        </nav>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col justify-between overflow-y-auto bg-card px-4 py-5 shadow-lift">
            <div>
              <div className="mb-5 flex items-center justify-between">
                <Wordmark />
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded-md p-2 text-ink-soft hover:bg-ink/5"><X className="h-5 w-5" /></button>
              </div>
              <NavList pathname={pathname} onNavigate={() => setDrawer(false)} />
            </div>
            <UserCard />
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <RequireAuth><Shell>{children}</Shell></RequireAuth>;
}
