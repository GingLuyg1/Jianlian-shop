"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  terms_of_service: "用户协议",
  privacy_policy: "隐私政策",
  refund_policy: "退款政策",
  digital_delivery_policy: "数字商品交付规则",
  purchase_notice: "商品购买须知",
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS);

type LegalDocument = {
  id: string;
  document_type: string;
  version: string;
  title: string;
  content: string;
  content_hash: string;
  status: string;
  effective_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM = { documentType: "terms_of_service", version: "", title: "", content: "", effectiveAt: "" };

export default function AdminLegalSettingsPage() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [documentType, setDocumentType] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState<LegalDocument | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const filteredDocuments = useMemo(() => documents, [documents]);

  async function fetchDocuments(filters = { status, documentType }) {
    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.documentType !== "all") params.set("documentType", filters.documentType);
    const response = await fetch(`/api/admin/legal?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "协议列表读取失败");
    return (payload.documents ?? []) as LegalDocument[];
  }

  async function loadDocuments() {
    setLoading(true);
    setError("");
    try {
      setDocuments(await fetchDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "协议列表读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [status, documentType]);

  async function locateExistingDraft(targetType: string, targetVersion: string) {
    const nextDocuments = await fetchDocuments({ status: "draft", documentType: targetType });
    setStatus("draft");
    setDocumentType(targetType);
    setDocuments(nextDocuments);
    const existing = nextDocuments.find(
      (document) => document.status === "draft" && document.document_type === targetType && document.version === targetVersion
    );
    if (existing) setSelected(existing);
  }

  async function postAction(
    body: Record<string, unknown>,
    successMessage: string,
    options: { duplicateDraft?: { documentType: string; version: string } } = {}
  ) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/legal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409 && options.duplicateDraft) {
          await locateExistingDraft(options.duplicateDraft.documentType, options.duplicateDraft.version);
        }
        throw new Error(payload?.error || "操作失败");
      }
      toast.success(successMessage);
      setEditingDraftId(null);
      setForm(EMPTY_FORM);
      setSelected(payload.document ?? null);
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  function saveDraft() {
    if (editingDraftId) {
      void postAction({ action: "update_draft", id: editingDraftId, ...form }, "协议草稿已更新");
      return;
    }
    void postAction(
      { action: "create_draft", ...form },
      "协议草稿已创建",
      { duplicateDraft: { documentType: form.documentType, version: form.version.trim() } }
    );
  }

  function editDraft(document: LegalDocument) {
    if (document.status !== "draft" || saving) return;
    setEditingDraftId(document.id);
    setForm({
      documentType: document.document_type,
      version: document.version,
      title: document.title,
      content: document.content,
      effectiveAt: document.effective_at ?? "",
    });
    setSelected(null);
  }

  function cancelEditing() {
    if (saving) return;
    setEditingDraftId(null);
    setForm(EMPTY_FORM);
  }

  function publishDocument(document: LegalDocument) {
    const reason = window.prompt(`发布 ${document.title} ${document.version} 的原因：`);
    if (!reason?.trim()) return;
    if (!window.confirm("发布后将归档同类型旧版本，确定继续？")) return;
    void postAction({ action: "publish", id: document.id, reason }, "协议版本已发布");
  }

  function archiveDocument(document: LegalDocument) {
    const reason = window.prompt(`归档 ${document.title} ${document.version} 的原因：`);
    if (!reason?.trim()) return;
    if (!window.confirm("归档不会影响历史订单查看，确定继续？")) return;
    void postAction({ action: "archive", id: document.id, reason }, "协议版本已归档");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">协议版本管理</h1>
          <p className="mt-1 text-sm text-slate-500">发布协议版本，保留下单时真实确认依据。</p>
        </div>
        <Button variant="outline" onClick={() => void loadDocuments()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{editingDraftId ? "编辑草稿" : "创建草稿"}</CardTitle>
              {editingDraftId ? <Button size="sm" variant="ghost" disabled={saving} onClick={cancelEditing}>取消编辑</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <select className="h-10 w-full rounded-md border px-3 text-sm disabled:bg-slate-50" disabled={Boolean(editingDraftId) || saving} value={form.documentType} onChange={(e) => setForm((v) => ({ ...v, documentType: e.target.value }))}>
              {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>)}
            </select>
            <Input disabled={Boolean(editingDraftId) || saving} placeholder="版本号，例如 2026.07.01" value={form.version} onChange={(e) => setForm((v) => ({ ...v, version: e.target.value }))} />
            <Input disabled={saving} placeholder="协议标题" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} />
            <Input disabled={saving} placeholder="生效时间，可选：2026-07-01T00:00:00+08:00" value={form.effectiveAt} onChange={(e) => setForm((v) => ({ ...v, effectiveAt: e.target.value }))} />
            <textarea disabled={saving} className="h-72 w-full resize-none rounded-md border px-3 py-2 text-sm disabled:bg-slate-50" placeholder="协议正文" value={form.content} onChange={(e) => setForm((v) => ({ ...v, content: e.target.value }))} />
            <Button className="w-full" disabled={saving} onClick={saveDraft}>{saving ? "保存中..." : editingDraftId ? "保存草稿修改" : "保存草稿"}</Button>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">协议版本</CardTitle>
              <div className="flex gap-2">
                <select className="h-9 rounded-md border px-3 text-sm" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                  <option value="all">全部类型</option>
                  {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>)}
                </select>
                <select className="h-9 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">全部状态</option>
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto p-0">
            {error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {loading ? (
              <div className="py-20 text-center text-sm text-slate-500">正在读取协议...</div>
            ) : filteredDocuments.length ? (
              <div className="divide-y">
                {filteredDocuments.map((doc) => (
                  <div key={doc.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                    <button className="min-w-0 text-left" onClick={() => setSelected(doc)}>
                      <div className="font-semibold text-slate-950">{doc.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type} / {doc.version} / {doc.status}</div>
                      <div className="mt-1 truncate font-mono text-xs text-slate-400">{doc.content_hash}</div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => setSelected(doc)}>预览</Button>
                      {doc.status === "draft" ? <Button size="sm" variant="outline" disabled={saving} onClick={() => editDraft(doc)}>编辑</Button> : null}
                      {doc.status === "draft" ? <Button size="sm" disabled={saving} onClick={() => publishDocument(doc)}>发布</Button> : null}
                      {doc.status === "published" ? <Button size="sm" variant="outline" disabled={saving} onClick={() => archiveDocument(doc)}>归档</Button> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-sm text-slate-500">暂无协议版本。请先创建草稿。</div>
            )}
          </CardContent>
        </Card>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={() => setSelected(null)}>
          <aside className="h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{DOCUMENT_TYPE_LABELS[selected.document_type] ?? selected.document_type} / {selected.version} / {selected.status}</p>
              </div>
              <Button variant="ghost" onClick={() => setSelected(null)}>关闭</Button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-7 text-slate-700">{selected.content}</pre>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
