import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("dist/internal", { recursive: true });
await build({
  absWorkingDir: process.cwd(),
  entryPoints: ["scripts/internal/snpay-production-canary.ts"],
  outfile: "dist/internal/snpay-production-canary.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  alias: { "@": ".", "server-only": "./scripts/internal/server-only-stub.mjs" },
  sourcemap: false,
  legalComments: "none",
});
console.log("CANARY_ADAPTER_COMPILE=PASS");
