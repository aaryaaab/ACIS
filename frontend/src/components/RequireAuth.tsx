"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Mark } from "./domain";
import { Spinner } from "./ui";

export function FullPageLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <Mark size={40} />
      <Spinner label="Loading your workspace" />
    </div>
  );
}

/** Sends signed-out visitors to /login, and students who skipped onboarding to /onboarding. */
export function RequireAuth({ children, needsOnboarding = true }: { children: ReactNode; needsOnboarding?: boolean }) {
  const { status, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const mustOnboard = status === "authed" && needsOnboarding && !profile?.onboarding_done;

  useEffect(() => {
    if (status === "anon") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (mustOnboard) router.replace("/onboarding");
  }, [status, mustOnboard, router, pathname]);

  if (status !== "authed" || mustOnboard) return <FullPageLoading />;
  return <>{children}</>;
}
