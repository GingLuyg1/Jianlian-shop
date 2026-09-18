import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";

/** @type {Readonly<Record<string, string>>} */
export const CHANNEL_PATHS = Object.freeze({
  "/callback/wechat": "/api/payments/callback/wechat",
  "/callback/alipay": "/api/payments/callback/alipay",
});

export const DEFAULT_TIMEOUTS = Object.freeze({
  connectMs: 900,
  responseMs: 2_500,
  totalMs: 3_500,
});

const MAX_ORIGIN_BODY_BYTES = 64 * 1024;

class RelayTimeoutError extends Error {
  /** @param {"connect" | "response" | "total"} stage */
  constructor(stage) {
    super(`${stage}_timeout`);
    this.name = "RelayTimeoutError";
    this.stage = stage;
  }
}

/** @param {string} rawQuery */
export function hasMalformedPercentEncoding(rawQuery) {
  return /%(?![0-9a-fA-F]{2})/.test(rawQuery);
}

/** @param {string | undefined} rawTarget */
export function parseRelayTarget(rawTarget) {
  if (!rawTarget) return null;

  const queryIndex = rawTarget.indexOf("?");
  const path = queryIndex === -1 ? rawTarget : rawTarget.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : rawTarget.slice(queryIndex + 1);
  const originPath = CHANNEL_PATHS[path];
  if (!originPath) return null;

  return {
    channel: path === "/callback/wechat" ? "wechat" : "alipay",
    originPath,
    queryPresent: queryIndex !== -1 && rawQuery.length > 0,
    rawQuery,
  };
}

/** @param {number} startedAt */
function elapsedMs(startedAt) {
  return Number((performance.now() - startedAt).toFixed(1));
}

/**
 * @typedef {{
 *   statusCode: number,
 *   contentType?: string,
 *   body: Buffer,
 *   timings: {
 *     dnsMs: number | null,
 *     connectMs: number | null,
 *     tlsMs: number | null,
 *     ttfbMs: number | null,
 *     totalMs: number
 *   }
 * }} OriginResponse
 */

/**
 * Forward one request to the operator-controlled origin. The raw query is
 * appended byte-for-byte; callback parameters are never parsed or rebuilt.
 *
 * @param {{
 *   originBaseUrl: URL,
 *   originPath: string,
 *   rawQuery: string,
 *   requestId: string,
 *   sourceIp: string,
 *   timeouts: typeof DEFAULT_TIMEOUTS
 * }} input
 * @returns {Promise<OriginResponse>}
 */
export function requestOrigin(input) {
  const startedAt = performance.now();
  const transport = input.originBaseUrl.protocol === "https:" ? https : http;
  const targetPath = `${input.originPath}${input.rawQuery ? `?${input.rawQuery}` : ""}`;

  /** @type {NodeJS.Timeout | undefined} */
  let connectTimer;
  /** @type {NodeJS.Timeout | undefined} */
  let responseTimer;
  /** @type {NodeJS.Timeout | undefined} */
  let totalTimer;
  /** @type {number | null} */
  let dnsMs = null;
  /** @type {number | null} */
  let connectMs = null;
  /** @type {number | null} */
  let tlsMs = null;

  return new Promise((resolve, reject) => {
    let settled = false;

    const clearTimers = () => {
      if (connectTimer) clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      if (totalTimer) clearTimeout(totalTimer);
    };

    /** @param {Error} error */
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    };

    const request = transport.request(
      {
        protocol: input.originBaseUrl.protocol,
        hostname: input.originBaseUrl.hostname,
        port: input.originBaseUrl.port || undefined,
        method: "GET",
        path: targetPath,
        headers: {
          Accept: "text/plain, application/json;q=0.9, */*;q=0.8",
          "User-Agent": "Jianlian-Payment-Callback-Relay/1.0",
          "X-Forwarded-For": input.sourceIp,
          "X-Forwarded-Proto": "https",
          "X-Request-ID": input.requestId,
        },
        agent: false,
      },
      (response) => {
        if (responseTimer) clearTimeout(responseTimer);
        const ttfbMs = elapsedMs(startedAt);
        /** @type {Buffer[]} */
        const chunks = [];
        let receivedBytes = 0;

        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > MAX_ORIGIN_BODY_BYTES) {
            request.destroy(new Error("origin_response_too_large"));
            return;
          }
          chunks.push(buffer);
        });

        response.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimers();
          resolve({
            statusCode: response.statusCode ?? 502,
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : undefined,
            body: Buffer.concat(chunks),
            timings: {
              dnsMs,
              connectMs,
              tlsMs,
              ttfbMs,
              totalMs: elapsedMs(startedAt),
            },
          });
        });
      },
    );

    request.once("socket", (socket) => {
      if (socket.connecting) {
        connectTimer = setTimeout(() => {
          request.destroy(new RelayTimeoutError("connect"));
        }, input.timeouts.connectMs);
      }
      socket.once("lookup", () => {
        dnsMs = elapsedMs(startedAt);
      });
      socket.once("connect", () => {
        if (connectTimer) clearTimeout(connectTimer);
        connectMs = elapsedMs(startedAt);
      });
      socket.once("secureConnect", () => {
        tlsMs = elapsedMs(startedAt);
      });
    });

    request.once("error", fail);
    responseTimer = setTimeout(() => {
      request.destroy(new RelayTimeoutError("response"));
    }, input.timeouts.responseMs);
    totalTimer = setTimeout(() => {
      request.destroy(new RelayTimeoutError("total"));
    }, input.timeouts.totalMs);
    request.end();
  });
}

/** @param {http.ServerResponse} response */
function applyRelayHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

/**
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {number} statusCode
 * @param {string} body
 */
function sendText(request, response, statusCode, body) {
  void request;
  applyRelayHeaders(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(body);
}

/**
 * The origin is dependency-injected by the process owner, never by a client
 * request. Production uses the hard-coded Jianlian origin in server.mjs.
 *
 * @param {{
 *   originBaseUrl: URL,
 *   logger?: Pick<Console, "info">,
 *   timeouts?: typeof DEFAULT_TIMEOUTS,
 *   forward?: typeof requestOrigin
 * }} options
 */
export function createRelayHandler(options) {
  const logger = options.logger ?? console;
  const timeouts = options.timeouts ?? DEFAULT_TIMEOUTS;
  const forward = options.forward ?? requestOrigin;

  /** @param {http.IncomingMessage} request @param {http.ServerResponse} response */
  return async function relayHandler(request, response) {
    const startedAt = performance.now();
    const requestId = randomUUID();
    const parentRequestIdPresent = Boolean(request.headers["x-request-id"]);
    const parsed = parseRelayTarget(request.url);
    const sourceIp = request.socket.remoteAddress ?? "unknown";

    response.setHeader("X-Request-ID", requestId);

    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendText(request, response, 405, "method not allowed");
      logger.info({
        event: "callback_relay",
        request_id: requestId,
        channel: parsed?.channel ?? "unknown",
        source_ip: sourceIp,
        origin_status: null,
        relay_status: 405,
        total_ms: elapsedMs(startedAt),
        query_present: parsed?.queryPresent ?? false,
        parent_request_id_present: parentRequestIdPresent,
      });
      return;
    }

    if (!parsed) {
      sendText(request, response, 404, "not found");
      logger.info({
        event: "callback_relay",
        request_id: requestId,
        channel: "unknown",
        source_ip: sourceIp,
        origin_status: null,
        relay_status: 404,
        total_ms: elapsedMs(startedAt),
        query_present: false,
        parent_request_id_present: parentRequestIdPresent,
      });
      return;
    }

    if (hasMalformedPercentEncoding(parsed.rawQuery)) {
      sendText(request, response, 400, "malformed query");
      logger.info({
        event: "callback_relay",
        request_id: requestId,
        channel: parsed.channel,
        source_ip: sourceIp,
        origin_status: null,
        relay_status: 400,
        total_ms: elapsedMs(startedAt),
        query_present: parsed.queryPresent,
        parent_request_id_present: parentRequestIdPresent,
      });
      return;
    }

    try {
      const originResponse = await forward({
        originBaseUrl: options.originBaseUrl,
        originPath: parsed.originPath,
        rawQuery: parsed.rawQuery,
        requestId,
        sourceIp,
        timeouts,
      });

      applyRelayHeaders(response);
      response.statusCode = originResponse.statusCode;
      if (originResponse.contentType) {
        response.setHeader("Content-Type", originResponse.contentType);
      }
      response.end(originResponse.body);

      logger.info({
        event: "callback_relay",
        request_id: requestId,
        channel: parsed.channel,
        source_ip: sourceIp,
        origin_status: originResponse.statusCode,
        relay_status: originResponse.statusCode,
        dns_ms: originResponse.timings.dnsMs,
        connect_ms: originResponse.timings.connectMs,
        tls_ms: originResponse.timings.tlsMs,
        ttfb_ms: originResponse.timings.ttfbMs,
        total_ms: originResponse.timings.totalMs,
        query_present: parsed.queryPresent,
        parent_request_id_present: parentRequestIdPresent,
      });
    } catch (error) {
      const timeout = error instanceof RelayTimeoutError;
      const statusCode = timeout ? 504 : 502;
      sendText(request, response, statusCode, timeout ? "origin timeout" : "origin unavailable");
      logger.info({
        event: "callback_relay",
        request_id: requestId,
        channel: parsed.channel,
        source_ip: sourceIp,
        origin_status: null,
        relay_status: statusCode,
        failure_category: timeout ? error.message : "network_failure",
        total_ms: elapsedMs(startedAt),
        query_present: parsed.queryPresent,
        parent_request_id_present: parentRequestIdPresent,
      });
    }
  };
}

/**
 * @param {{
 *   originBaseUrl: URL,
 *   logger?: Pick<Console, "info">,
 *   timeouts?: typeof DEFAULT_TIMEOUTS,
 *   forward?: typeof requestOrigin
 * }} options
 */
export function createRelayServer(options) {
  return http.createServer(createRelayHandler(options));
}
