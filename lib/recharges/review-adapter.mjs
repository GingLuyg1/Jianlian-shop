function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Executes one write CAS and, if its transport result is unknowable, performs
 * exactly one read-only reconciliation. The write is never replayed here.
 */
export async function executeRechargeWriteCas({
  executeWrite,
  readLatest,
  parseRow,
}) {
  try {
    const response = await executeWrite();
    if (!isObject(response) || !("data" in response) || !("error" in response)) {
      throw new Error("indeterminate write response");
    }
    if (response.error) throw new Error("write transport returned an error");
    if (response.data == null) return { kind: "not_updated", row: null };
    return { kind: "updated", row: parseRow(response.data) };
  } catch {
    try {
      return { kind: "uncertain", row: await readLatest() };
    } catch {
      return { kind: "uncertain", row: null };
    }
  }
}

export function isRechargeWriteCasResult(value) {
  return isObject(value)
    && ["updated", "not_updated", "uncertain"].includes(value.kind);
}
