import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGAL_ERROR_MESSAGES,
  classifyLegalDatabaseError,
  getLegalConstraintSummary,
} from "../../lib/legal/legal-error.mjs";

test("legal database errors are classified by exact code", () => {
  assert.deepEqual(classifyLegalDatabaseError({ code: "23505", message: "duplicate" }), {
    code: "23505",
    status: 409,
    category: "duplicate",
    message: "该协议类型和版本号已存在，请编辑现有草稿或更换版本号。",
  });
  assert.deepEqual(classifyLegalDatabaseError({ code: "42501" }), {
    code: "42501",
    status: 403,
    category: "forbidden",
    message: "当前账号无权管理协议版本。",
  });
  assert.equal(classifyLegalDatabaseError({ code: "42P01" }).status, 503);
  assert.equal(classifyLegalDatabaseError({ code: "PGRST205" }).status, 503);
  assert.equal(classifyLegalDatabaseError({ code: "42703" }).message, LEGAL_ERROR_MESSAGES.incompatibleSchema);
  assert.equal(classifyLegalDatabaseError({ code: "PGRST204" }).message, LEGAL_ERROR_MESSAGES.incompatibleSchema);
});

test("table names and schema-cache text alone never imply a missing table", () => {
  const result = classifyLegalDatabaseError({
    code: "XX000",
    message: "legal_documents schema cache failed with internal SQL details",
  });
  assert.equal(result.status, 500);
  assert.equal(result.category, "database_error");
  assert.equal(result.message, LEGAL_ERROR_MESSAGES.generic);
  assert.doesNotMatch(result.message, /legal_documents|schema cache|SQL/i);
});

test("unknown errors use caller-safe fallback without exposing raw database details", () => {
  const result = classifyLegalDatabaseError(
    { code: "PGRST999", message: "secret SQL and agreement body" },
    "协议列表读取失败，请稍后重试。"
  );
  assert.equal(result.status, 500);
  assert.equal(result.message, "协议列表读取失败，请稍后重试。");
  assert.doesNotMatch(result.message, /secret|SQL|agreement body/i);
});

test("constraint logging keeps only a bounded identifier summary", () => {
  assert.equal(
    getLegalConstraintSummary({ message: 'duplicate key violates unique constraint "legal_documents_document_type_version_key"' }),
    "legal_documents_document_type_version_key"
  );
  assert.equal(getLegalConstraintSummary({ constraint: "unsafe value; DROP TABLE x" }), "unsafevalueDROPTABLEx");
  assert.equal(getLegalConstraintSummary({ details: "agreement body without a constraint" }), null);
});
