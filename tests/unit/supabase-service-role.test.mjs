import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = resolve(import.meta.dirname, "../..");
const serviceRolePath = resolve(projectRoot, "lib/supabase/service-role.ts");
const serviceRoleSource = readFileSync(serviceRolePath, "utf8");
const nativeRequire = createRequire(import.meta.url);

function loadServiceRoleModule() {
  const transpiled = ts.transpileModule(serviceRoleSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: serviceRolePath,
  }).outputText;
  const loadedModule = new Module(serviceRolePath);
  loadedModule.filename = serviceRolePath;
  loadedModule.paths = Module._nodeModulePaths(projectRoot);
  loadedModule.require = (specifier) => (
    specifier === "server-only" ? {} : nativeRequire(specifier)
  );
  loadedModule._compile(transpiled, serviceRolePath);
  return loadedModule.exports;
}

function encodeJwtSegment(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function makeJwt(role) {
  return `${encodeJwtSegment({ alg: "HS256", typ: "JWT" })}.${encodeJwtSegment({ role })}.signature`;
}

function withServiceRoleEnvironment(callback) {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SECRET",
    "SUPABASE_SERVICE_KEY",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];

  try {
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("service-role client uses ws transport when native WebSocket is unavailable", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const consoleOutput = [];
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  let fetchCalls = 0;

  try {
    delete globalThis.WebSocket;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("NETWORK_REQUEST_NOT_ALLOWED");
    };
    console.log = (...args) => consoleOutput.push(args.join(" "));
    console.warn = (...args) => consoleOutput.push(args.join(" "));
    console.error = (...args) => consoleOutput.push(args.join(" "));

    withServiceRoleEnvironment(() => {
      const module = loadServiceRoleModule();

      assert.equal(module.getSupabaseServiceRoleClient(), null);

      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_unit_test_value";
      const secretClient = module.getSupabaseServiceRoleClient();
      assert.ok(secretClient);

      process.env.SUPABASE_SERVICE_ROLE_KEY = makeJwt("service_role");
      assert.deepEqual(module.getSupabaseServiceRoleConfiguration(), {
        urlPresent: true,
        serviceRolePresent: true,
        keyType: "jwt",
        jwtRole: "service_role",
        valid: true,
      });
      assert.ok(module.getSupabaseServiceRoleClient());

      process.env.SUPABASE_SERVICE_ROLE_KEY = makeJwt("authenticated");
      assert.equal(module.getSupabaseServiceRoleConfiguration().valid, false);
      assert.equal(module.getSupabaseServiceRoleClient(), null);
    });

    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(consoleOutput.join("\n"), /sb_secret_unit_test_value|service_role/i);
    assert.doesNotMatch(
      consoleOutput.join("\n"),
      /Node\.js 20 detected without native WebSocket support/i,
    );
  } finally {
    if (originalWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }
});

test("service-role source configures only the server client with ws transport", () => {
  assert.match(serviceRoleSource, /import ws from "ws"/);
  assert.match(serviceRoleSource, /realtime:\s*\{\s*transport:\s*ws as any/);
  assert.doesNotMatch(serviceRoleSource, /\.channel\(|\.subscribe\(/);
});
