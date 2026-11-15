/**
 * Optional Umbral API client. The API base is a public URL (VITE_UMBRAL_API);
 * no credentials are ever placed in the browser. When the variable is unset,
 * or the API fails or times out, the bundled processed file is used and the
 * result says so. A bundled snapshot is never labelled live.
 */
export interface Fetched<T> {
  data: T;
  origin: "Umbral API" | "bundled snapshot";
  note: string;
}

export const API_BASE: string | null = (import.meta.env?.VITE_UMBRAL_API as string | undefined)?.replace(/\/$/, "") || null;

export async function withFallback<T>(apiPath: string, pick: (body: Record<string, unknown>) => T, bundled: () => Promise<T>, opts: { base?: string | null; timeoutMs?: number; fetcher?: typeof fetch } = {}): Promise<Fetched<T>> {
  const base = opts.base === undefined ? API_BASE : opts.base;
  const fetcher = opts.fetcher ?? fetch;
  if (base) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 3000);
    try {
      const r = await fetcher(`${base}${apiPath}`, { signal: ctl.signal });
      if (!r.ok) throw new Error(`API answered ${r.status}`);
      const body = (await r.json()) as Record<string, unknown>;
      if (body.schema !== "umbral.api/1") throw new Error("unexpected API schema");
      return { data: pick(body), origin: "Umbral API", note: `Umbral API (${String(body.status)}, processed ${String(body.processed ?? "—")})` };
    } catch (e) {
      const data = await bundled();
      return { data, origin: "bundled snapshot", note: `Bundled snapshot (API not used: ${ctl.signal.aborted ? "timeout" : e instanceof Error ? e.message : "error"})` };
    } finally {
      clearTimeout(t);
    }
  }
  return { data: await bundled(), origin: "bundled snapshot", note: "Bundled snapshot (no API configured)" };
}
