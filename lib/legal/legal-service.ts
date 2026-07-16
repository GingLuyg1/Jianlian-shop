import "server-only";

import { createHash, randomUUID } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const REQUIRED_CHECKOUT_DOCUMENT_TYPES = [
  "terms_of_service",
  "refund_policy",
  "digital_delivery_policy",
  "purchase_notice",
] as const;

export type LegalDocumentType =
  | "terms_of_service"
  | "privacy_policy"
  | "refund_policy"
  | "digital_delivery_policy"
  | "purchase_notice";

export type LegalDocumentVersion = {
  id: string;
  document_type: LegalDocumentType;
  version: string;
  title: string;
  content: string;
  content_hash: string;
  status: "draft" | "published" | "archived";
  effective_at: string | null;
  published_at: string | null;
  published_by: string | null;
  publish_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type AgreementInput = {
  document_type?: string;
  document_version_id?: string;
  content_hash?: string;
};

export type VerifiedAgreement = {
  document: LegalDocumentVersion;
};

export function hashLegalContent(content: string) {
  return createHash("sha256").update(content.trim(), "utf8").digest("hex");
}

export function getRequestId(request?: Request) {
  return request?.headers.get("x-request-id") || request?.headers.get("x-correlation-id") || randomUUID();
}

function hashIp(value: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function getRequestIpHash(request?: Request) {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ip = forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-client-ip");
  return hashIp(ip);
}

export function getUserAgentSummary(request?: Request) {
  const ua = request?.headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 180) : null;
}

export async function listPublishedLegalDocuments(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("legal_documents")
    .select("id,document_type,version,title,content,content_hash,status,effective_at,published_at,published_by,created_at,updated_at")
    .eq("status", "published")
    .order("document_type", { ascending: true });

  if (error) throw error;
  return (data ?? []) as LegalDocumentVersion[];
}

export async function verifyCheckoutAgreements(
  supabase: SupabaseClient,
  agreements: AgreementInput[] | undefined
): Promise<VerifiedAgreement[]> {
  if (!Array.isArray(agreements)) {
    throw new Error("请先确认订单协议");
  }

  const expectedTypes = new Set<string>(REQUIRED_CHECKOUT_DOCUMENT_TYPES);
  const ids = agreements.map((item) => String(item.document_version_id ?? "").trim()).filter(Boolean);
  if (ids.length < REQUIRED_CHECKOUT_DOCUMENT_TYPES.length) {
    throw new Error("请确认全部订单协议后再下单");
  }

  const { data, error } = await supabase
    .from("legal_documents")
    .select("id,document_type,version,title,content,content_hash,status,effective_at,published_at,published_by,created_at,updated_at")
    .in("id", ids);
  if (error) throw error;

  const docs = (data ?? []) as LegalDocumentVersion[];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const acceptedTypes = new Set<string>();
  const verified: VerifiedAgreement[] = [];
  const now = Date.now();

  for (const input of agreements) {
    const id = String(input.document_version_id ?? "").trim();
    const doc = byId.get(id);
    if (!doc) throw new Error("协议版本不存在，请刷新后重试");
    if (!expectedTypes.has(doc.document_type)) continue;
    if (doc.status !== "published") throw new Error("协议版本已失效，请刷新后重新确认");
    if (doc.effective_at && new Date(doc.effective_at).getTime() > now) {
      throw new Error("协议版本尚未生效，请刷新后重新确认");
    }
    if (input.document_type && input.document_type !== doc.document_type) {
      throw new Error("协议确认信息不一致，请刷新后重试");
    }
    if (input.content_hash && input.content_hash !== doc.content_hash) {
      throw new Error("协议内容已更新，请重新确认");
    }
    acceptedTypes.add(doc.document_type);
    verified.push({ document: doc });
  }

  for (const type of Array.from(expectedTypes)) {
    if (!acceptedTypes.has(type)) throw new Error("请确认全部订单协议后再下单");
  }

  return verified;
}

export async function recordOrderAgreementAcceptances(input: {
  orderId: string;
  user: User;
  agreements: VerifiedAgreement[];
  request?: Request;
}) {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端数据库权限未配置，无法保存协议确认记录");

  const rows = input.agreements.map(({ document }) => ({
    order_id: input.orderId,
    user_id: input.user.id,
    document_type: document.document_type,
    document_version_id: document.id,
    document_version: document.version,
    content_hash: document.content_hash,
    acceptance_source: "checkout",
    ip_hash: getRequestIpHash(input.request),
    user_agent_summary: getUserAgentSummary(input.request),
    request_id: getRequestId(input.request),
  }));

  const { error } = await service.from("order_agreement_acceptances").upsert(rows, {
    onConflict: "order_id,document_type",
    ignoreDuplicates: true,
  });
  if (error) throw error;

  const { error: evidenceError } = await service.from("order_evidence_events").insert({
    order_id: input.orderId,
    user_id: input.user.id,
    event_type: "agreement_accepted",
    source: "checkout",
    title: "用户确认订单协议",
    summary: rows.map((row) => `${row.document_type}@${row.document_version}`).join(", "),
    request_id: getRequestId(input.request),
    metadata: { document_count: rows.length },
  });
  if (evidenceError) throw evidenceError;
}

export async function loadOrderEvidence(supabase: SupabaseClient, orderId: string) {
  const [agreements, documents, evidence] = await Promise.all([
    supabase
      .from("order_agreement_acceptances")
      .select("id,order_id,user_id,document_type,document_version_id,document_version,content_hash,accepted_at,acceptance_source,ip_hash,user_agent_summary,request_id,created_at")
      .eq("order_id", orderId)
      .order("accepted_at", { ascending: true }),
    supabase
      .from("order_agreement_acceptances")
      .select("legal_documents(id,document_type,version,title,content_hash,status,effective_at,published_at)")
      .eq("order_id", orderId),
    supabase
      .from("order_evidence_events")
      .select("id,event_type,source,title,summary,request_id,metadata,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    agreements: agreements.error ? [] : agreements.data ?? [],
    agreementError: agreements.error ? "协议确认记录读取失败" : null,
    documents: documents.error ? [] : documents.data ?? [],
    documentError: documents.error ? "协议历史版本读取失败" : null,
    events: evidence.error ? [] : evidence.data ?? [],
    evidenceError: evidence.error ? "订单证据事件读取失败" : null,
  };
}

