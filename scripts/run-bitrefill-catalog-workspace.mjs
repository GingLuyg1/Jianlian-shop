// Run manually: GET-only real catalog + LOCAL metadata, never production bindings.
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createPersonalCatalogClient } from "../lib/providers/bitrefill/personal-catalog-client.mjs";
import { createBitrefillCatalogManager } from "../lib/providers/bitrefill/catalog-management.mjs";
import { createWorkspaceBackend } from "./support/bitrefill-workspace-backend.mjs";
import { createCatalogWorkspace } from "./support/bitrefill-catalog-workspace.mjs";
import { catalogWorkspaceHtml } from "./support/bitrefill-catalog-ui.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const catalog = createBitrefillCatalogManager(createPersonalCatalogClient(process.env.BITREFILL_API_KEY));
  const directory = "D:\\Jianlian\\_bitrefill_catalog_mapping_v4_20261025\\workspace";
  const backend = await createWorkspaceBackend(directory);
  let app;
  try { app = await createCatalogWorkspace({ backend, catalog, renderHtml: (view) => catalogWorkspaceHtml(root, view) }); }
  catch (error) { await backend.close(); throw error; }
  console.log(JSON.stringify({ url: app.origin, metadataDirectory: directory, localOnly: true, realPurchaseEnabled: false }));
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); await backend.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
} catch { console.error("LOCAL_WORKSPACE_START_FAILED_CHECK_KEY_OR_METADATA_LOCK"); process.exitCode = 1; }
