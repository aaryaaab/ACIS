import { Briefcase, Compass, Gauge, History, LayoutDashboard, type LucideIcon, Map, MessageCircle, Newspaper, PenLine, Scale, Settings, TrendingUp, User, BookOpen } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavGroup { title: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { title: "Understand", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/careers", label: "Career directions", icon: Compass },
    { href: "/compare", label: "Compare careers", icon: Scale },
    { href: "/timeline", label: "Timeline", icon: History },
  ] },
  { title: "Learn & build", items: [
    { href: "/roadmap", label: "Roadmap", icon: Map },
    { href: "/skills", label: "Skills", icon: Gauge },
    { href: "/resources", label: "Resources", icon: BookOpen },
    { href: "/progress", label: "Progress", icon: TrendingUp },
  ] },
  { title: "Discover", items: [
    { href: "/mentor", label: "AI Mentor", icon: MessageCircle },
    { href: "/intelligence", label: "Career intelligence", icon: Newspaper },
    { href: "/opportunities", label: "Opportunities", icon: Briefcase },
  ] },
  { title: "You", items: [
    { href: "/reflections", label: "Reflections", icon: PenLine },
    { href: "/profile", label: "Profile & memory", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const MOBILE_TABS = ["/dashboard", "/careers", "/mentor", "/roadmap"];

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Only allow redirects to pages inside this app (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
