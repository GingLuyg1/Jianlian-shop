export type DajuErrorKind = "configuration" | "validation" | "http" | "transport" | "timeout" | "response";

export class DajuApiError extends Error {
  readonly kind: DajuErrorKind;
  readonly code: string;
  readonly status: number;

  constructor(input: { kind: DajuErrorKind; code: string; message: string; status?: number }) {
    super(input.message);
    this.name = "DajuApiError";
    this.kind = input.kind;
    this.code = input.code;
    this.status = input.status ?? 503;
  }
}

export function getSafeDajuError(error: unknown) {
  if (error instanceof DajuApiError) {
    return { code: error.code, kind: error.kind, status: error.status };
  }
  if (error && typeof error === "object") {
    const row = error as { code?: unknown; kind?: unknown; status?: unknown };
    if (typeof row.code === "string" && typeof row.kind === "string") {
      return {
        code: row.code,
        kind: row.kind as DajuErrorKind,
        status: typeof row.status === "number" ? row.status : 503,
      };
    }
  }
  return { code: "UPSTREAM_UNAVAILABLE", kind: "transport" as const, status: 503 };
}
