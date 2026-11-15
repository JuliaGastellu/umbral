/**
 * Local HTTP server around the Worker handler, for trying the API without a
 * Cloudflare account: `npx vite-node worker/dev-server.ts` (port 8787).
 * `npx wrangler dev` (in worker/) runs the same code in the Workers runtime.
 */
import { createServer } from "node:http";
import { handle } from "./src/index";

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "https://umbral-altovalle.vercel.app,http://localhost:5199,http://localhost:5173";
const PORT = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  const t0 = performance.now();
  const r = await handle(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers as Record<string, string> }), { ALLOWED_ORIGINS });
  const body = Buffer.from(await r.arrayBuffer());
  const ms = performance.now() - t0;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.setHeader("Server-Timing", `handler;dur=${ms.toFixed(2)}`);
  res.writeHead(r.status);
  res.end(body);
}).listen(PORT, "127.0.0.1", () => console.log(`Umbral API on http://127.0.0.1:${PORT}`));
