import { createRelayServer, DEFAULT_TIMEOUTS } from "./relay.mjs";

const PRODUCTION_ORIGIN = new URL("https://jianlian.shop");
const port = parsePort(process.env.PORT);
const host = process.env.HOST?.trim() || "127.0.0.1";

/** @param {string | undefined} rawValue */
function parsePort(rawValue) {
  if (!rawValue) return 8787;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

const logger = {
  /** @param {Record<string, unknown>} fields */
  info(fields) {
    process.stdout.write(`${JSON.stringify({ ...fields, timestamp: new Date().toISOString() })}\n`);
  },
};

const server = createRelayServer({
  originBaseUrl: PRODUCTION_ORIGIN,
  logger,
  timeouts: DEFAULT_TIMEOUTS,
});

server.listen(port, host, () => {
  logger.info({
    event: "callback_relay_started",
    request_id: null,
    channel: null,
    source_ip: null,
    origin_status: null,
    relay_status: null,
    listen_host: host,
    listen_port: port,
    query_present: false,
  });
});

/** @param {string} signal */
function shutdown(signal) {
  logger.info({
    event: "callback_relay_stopping",
    request_id: null,
    channel: null,
    source_ip: null,
    origin_status: null,
    relay_status: null,
    signal,
    query_present: false,
  });
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
