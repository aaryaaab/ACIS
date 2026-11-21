import { vi } from "vitest";

type Handler = unknown | ((req: { body: any; url: URL }) => unknown);
export const json = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
export const fail = (status: number, detail: unknown) => json({ detail }, status);

/** Replaces fetch. Routes are keyed "METHOD /path". Any request without a mock fails loudly. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: any; headers: Record<string, string>; credentials?: RequestCredentials }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.startsWith("/api/")) url.pathname = url.pathname.slice(4);        // the browser calls /api/..., the backend sees /...
    const method = (init?.method ?? "GET").toUpperCase();
    let body: any = undefined;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    else if (init?.body instanceof FormData) body = Object.fromEntries(init.body.entries());
    calls.push({ method, path: url.pathname + url.search, body, headers: (init?.headers ?? {}) as Record<string, string>, credentials: init?.credentials });
    const h = routes[`${method} ${url.pathname}`];
    if (h === undefined) return fail(500, `No mock for ${method} ${url.pathname}`);
    const v = typeof h === "function" ? (h as (r: { body: any; url: URL }) => unknown)({ body, url }) : h;
    return v instanceof Response ? v : json(v, method === "DELETE" ? 204 : 200);
  });
  return { calls, called: (key: string) => calls.filter((c) => `${c.method} ${c.path.split("?")[0]}` === key) };
}
