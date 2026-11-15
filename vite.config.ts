/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

// The data files keep fixed names, so each request carries a hash of their content: a new
// release never reuses a browser's cached copy of an older file.
const dataVersion = (() => {
  const h = createHash("sha256");
  for (const f of readdirSync("public/data").filter((n) => n.endsWith(".json")).sort()) h.update(f).update(readFileSync(`public/data/${f}`));
  return h.digest("hex").slice(0, 12);
})();

// Relative base so the built site runs from any static host or sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __DATA_VERSION__: JSON.stringify(dataVersion) },
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "worker/test/**/*.test.ts"] },
});
