/**
 * The only place that talks to the backend.
 *
 * Login is a session cookie that the browser keeps and JavaScript cannot read (httpOnly), so there is no token
 * anywhere in this code, in localStorage, or in the page. Requests go to /api on the same website, which Next.js
 * forwards to the backend, so the cookie is first-party. On requests that change data we copy the value of the
 * readable "acis_csrf" cookie into an X-CSRF-Token header. The backend checks that the two match.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "/api").replace(/\/$/, "");
const CSRF_COOKIE = "acis_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** 401 on these just means "wrong password" or "not signed in", not "your session expired". */
const AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/me", "/auth/logout"];

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI sends either a string or a list of {loc, msg}. Turn both into one readable sentence. */
export function readableDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      if (typeof d?.msg !== "string") return null;
      const field = Array.isArray(d.loc) ? d.loc.filter((x: unknown) => x !== "body").join(" › ") : "";
      const msg = d.msg.replace(/^Value error, /, "");
      return field ? `${field}: ${msg}` : msg;
    }).filter(Boolean);
    if (parts.length) return parts.join(". ");
  }
  return fallback;
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;                     // the browser sets the multipart boundary itself
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body, signal: opts.signal, credentials: "include" });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "Can't reach the ACIS server. Please check that the backend is running and try again.");
  }
  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    if (res.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p)) && typeof window !== "undefined") {
      window.dispatchEvent(new Event("acis:unauthorized"));      // the session has ended: the app signs the student out
    }
    const fallback = res.status >= 500 ? "Something went wrong on our side. Please try again." : `Request failed (${res.status})`;
    throw new ApiError(res.status, readableDetail((data as { detail?: unknown } | null)?.detail, fallback));
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
};

/** Downloads a JSON endpoint as a file (used for "download my data"). */
export async function downloadJson(path: string, filename: string): Promise<void> {
  const data = await http.get<unknown>(path);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const qs = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
