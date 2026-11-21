"use client";
import { useAuth } from "@/lib/auth";
import { ButtonLink } from "./ui";

export function LandingAuthButtons({ size = "md" }: { size?: "md" | "lg" }) {
  const { status } = useAuth();
  const big = size === "lg" ? "px-6 py-3 text-base" : "";
  if (status === "authed") return <ButtonLink href="/dashboard" className={big}>Open your dashboard</ButtonLink>;
  return (
    <>
      <ButtonLink href="/signup" className={big}>Start free</ButtonLink>
      <ButtonLink href="/login" variant="secondary" className={big}>Log in</ButtonLink>
    </>
  );
}

export function LandingNavActions() {
  const { status } = useAuth();
  return status === "authed"
    ? <ButtonLink href="/dashboard">Dashboard</ButtonLink>
    : <><ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">Log in</ButtonLink><ButtonLink href="/signup">Get started</ButtonLink></>;
}
