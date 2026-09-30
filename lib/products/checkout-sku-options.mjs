export function mergeCheckoutSkuOptions(databaseOptions, legacyOptions) {
  const database = Array.isArray(databaseOptions) ? databaseOptions : [];
  const legacy = Array.isArray(legacyOptions) ? legacyOptions : [];
  if (database.length === 0) return legacy;

  const databaseCodes = new Set(
    database.map((option) => String(option.code ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const compatibilityPlaceholders = legacy
    .filter((option) => !databaseCodes.has(String(option.code ?? option.id ?? "").trim().toLowerCase()))
    .map((option) => ({
      ...option,
      stock: 0,
      status: "draft",
      isDatabaseSku: false,
      isCompatibilityPlaceholder: true,
    }));

  return [...database, ...compatibilityPlaceholders];
}

export function findCheckoutSkuOption(options, requestedIdOrCode) {
  const normalized = String(requestedIdOrCode ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  return (Array.isArray(options) ? options : []).find((option) =>
    String(option?.id ?? "").trim().toLowerCase() === normalized
    || String(option?.code ?? "").trim().toLowerCase() === normalized,
  );
}
