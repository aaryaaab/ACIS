import { vi } from "vitest";

export const nav = {
  replace: vi.fn(), push: vi.fn(), back: vi.fn(),
  params: new URLSearchParams(), pathname: "/dashboard",
};
export function resetNav(query = "", pathname = "/dashboard") {
  nav.replace = vi.fn(); nav.push = vi.fn(); nav.back = vi.fn();
  nav.params = new URLSearchParams(query); nav.pathname = pathname;
}
export const navModule = {
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
};
