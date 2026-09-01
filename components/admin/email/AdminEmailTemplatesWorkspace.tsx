"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, FileEdit, Loader2, MailPlus, RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_TEMPLATE_CODES } from "@/lib/email/types";

type TemplateSummary = {
  id: string;
  template_code: string;
  version: number;
  name: string | null;
  subject_template: string;
  status: "draft" | "published" | "archived";
  is_current: boolean;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
};

type TemplateDetail = TemplateSummary & {
  html_template: string;
  text_template: string | null;
  variables_schema: Record<string, unknown> | null;
};

type EditorState = {
  templateCode: string;
  name: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  variablesSchema: string;
};

const EMPTY_EDITOR: EditorState = {
  templateCode: EMAIL_TEMPLATE_CODES[0],
  name: "",
  subjectTemplate: "",
  htmlTemplate: "",
  textTemplate: "",
  variablesSchema: "{}",
};

function parseVariablesSchema(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false as const, error: "变量 Schema 必须是 JSON 对象。" };
    }
    return { ok: true as const, value: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false as const, error: `变量 Schema JSON 格式错误：${error instanceof Error ? error.message : "无法解析"}` };
  }
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function TemplateStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { draft: "草稿", published: "已发布", archived: "已归档" };
  const className = status === "published"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "archived"
      ? "border-slate-200 bg-slate-100 text-slate-600"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return <Badge variant="outline" className={className}>{labels[status] ?? status}</Badge>;
}

export default function AdminEmailTemplatesWorkspace() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [templateCode, setTemplateCode] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "detail">("create");
  const [selected, setSelected] = useState<TemplateDetail | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const pageSize = 20;

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (templateCode) params.set("templateCode", templateCode);
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/notifications/email-templates?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "邮件模板读取失败");
      setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
      setTotal(Number(payload.total) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "邮件模板读取失败");
      setTemplates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, templateCode, status]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function openCreate() {
    setMode("create");
    setSelected(null);
    setEditor(EMPTY_EDITOR);
    setActionReason("");
    setSheetOpen(true);
  }

  async function openDetail(template: TemplateSummary) {
    setMode("detail");
    setSelected(null);
    setActionReason("");
    setSheetOpen(true);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/notifications/email-templates/${template.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "邮件模板详情读取失败");
      const detail = payload.template as TemplateDetail;
      setSelected(detail);
      setEditor({
        templateCode: detail.template_code,
        name: detail.name ?? "",
        subjectTemplate: detail.subject_template,
        htmlTemplate: detail.html_template,
        textTemplate: detail.text_template ?? "",
        variablesSchema: JSON.stringify(detail.variables_schema ?? {}, null, 2),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "邮件模板详情读取失败");
      setSheetOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function createTemplate() {
    const parsed = parseVariablesSchema(editor.variablesSchema);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    if (!editor.subjectTemplate.trim() || !editor.htmlTemplate.trim()) {
      toast.error("邮件主题和 HTML 模板不能为空");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/notifications/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode: editor.templateCode,
          name: editor.name,
          subjectTemplate: editor.subjectTemplate,
          htmlTemplate: editor.htmlTemplate,
          textTemplate: editor.textTemplate,
          variablesSchema: parsed.value,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "新建模板版本失败");
      toast.success("草稿模板版本已创建");
      setSheetOpen(false);
      setPage(1);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新建模板版本失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateDraft() {
    if (!selected || selected.status !== "draft") return;
    const parsed = parseVariablesSchema(editor.variablesSchema);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/notifications/email-templates/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name: editor.name,
          subjectTemplate: editor.subjectTemplate,
          htmlTemplate: editor.htmlTemplate,
          textTemplate: editor.textTemplate,
          variablesSchema: parsed.value,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "草稿保存失败");
      toast.success("草稿已保存");
      setSelected(payload.template as TemplateDetail);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "草稿保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(action: "publish" | "archive") {
    if (!selected) return;
    const reason = actionReason.trim();
    if (!reason) {
      toast.error(action === "publish" ? "发布必须填写原因" : "归档必须填写原因");
      return;
    }
    const label = action === "publish" ? "发布" : "归档";
    if (!window.confirm(`确认${label} ${selected.template_code} v${selected.version}？此操作会记录审计原因。`)) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/notifications/email-templates/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `${label}模板失败`);
      toast.success(`模板已${label}`);
      setSheetOpen(false);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label}模板失败`);
    } finally {
      setSubmitting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const editable = mode === "create" || selected?.status === "draft";

  return (
    <AdminPageShell
      title="邮件模板"
      description="创建、维护和发布邮件模板版本；已发布内容保持只读，所有发布与归档操作记录原因。"
      actions={(
        <>
          <Button asChild variant="outline"><Link href="/admin/notifications/email-deliveries">发送记录</Link></Button>
          <Button onClick={openCreate}><MailPlus className="mr-2 h-4 w-4" />新建模板版本</Button>
        </>
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <select value={templateCode} onChange={(event) => { setTemplateCode(event.target.value); setPage(1); }} className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm">
            <option value="">全部模板代码</option>
            {EMAIL_TEMPLATE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="archived">已归档</option>
          </select>
          <Button variant="outline" onClick={loadTemplates} disabled={loading}><RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>
          <span className="ml-auto text-xs text-slate-500">共 {total} 个模板版本</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {error ? (
            <AdminErrorState title="邮件模板读取失败" description={error} onRetry={loadTemplates} />
          ) : loading ? (
            <AdminTableSkeleton rows={8} />
          ) : templates.length === 0 ? (
            <AdminEmptyState icon={<MailPlus className="h-5 w-5" />} title={templateCode || status ? "当前筛选没有模板版本" : "暂无邮件模板"} description={templateCode || status ? "请调整模板代码或状态筛选。" : "创建第一个草稿版本后，可在此编辑并发布。"} action={<Button onClick={openCreate}>新建模板版本</Button>} />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-[1040px] w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">模板代码</th><th className="px-4 py-3">版本</th><th className="px-4 py-3">名称</th><th className="px-4 py-3">主题</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">当前版本</th><th className="px-4 py-3">更新时间</th><th className="px-4 py-3 text-right">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">{template.template_code}</td>
                      <td className="px-4 py-3">v{template.version}</td>
                      <td className="max-w-[220px] truncate px-4 py-3">{template.name || "—"}</td>
                      <td className="max-w-[320px] truncate px-4 py-3" title={template.subject_template}>{template.subject_template}</td>
                      <td className="px-4 py-3"><TemplateStatusBadge status={template.status} /></td>
                      <td className="px-4 py-3">{template.is_current ? <Badge variant="secondary">当前</Badge> : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500"><div>更新 {formatTime(template.updated_at)}</div><div className="mt-1">发布 {formatTime(template.published_at)}</div></td>
                      <td className="px-4 py-3 text-right"><Button variant="outline" size="sm" onClick={() => openDetail(template)}><FileEdit className="mr-2 h-4 w-4" />{template.status === "draft" ? "查看/编辑" : "查看"}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && total > pageSize ? (
            <div className="flex shrink-0 items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-slate-500">第 {page} / {pageCount} 页</span>
              <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div>
            </div>
          ) : null}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{mode === "create" ? "新建模板版本" : selected ? `${selected.template_code} v${selected.version}` : "模板详情"}</SheetTitle>
            <SheetDescription>{mode === "create" ? "创建新的草稿版本，不会直接发布或发送邮件。" : selected?.status === "draft" ? "草稿可以编辑、保存后再发布。" : "已发布或归档模板仅供查看。"}</SheetDescription>
          </SheetHeader>

          {detailLoading ? <AdminTableSkeleton rows={6} className="mt-4" /> : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="email-template-code">模板代码</Label>{mode === "create" ? <select id="email-template-code" value={editor.templateCode} onChange={(event) => setEditor((current) => ({ ...current, templateCode: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{EMAIL_TEMPLATE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}</select> : <Input id="email-template-code" value={editor.templateCode} disabled />}</div>
                <div className="space-y-2"><Label htmlFor="email-template-name">名称</Label><Input id="email-template-name" value={editor.name} disabled={!editable} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} /></div>
              </div>
              {selected ? <div className="flex flex-wrap items-center gap-2"><TemplateStatusBadge status={selected.status} />{selected.is_current ? <Badge variant="secondary">当前发布版本</Badge> : null}<span className="text-xs text-slate-500">更新于 {formatTime(selected.updated_at ?? selected.published_at)}</span></div> : null}
              <div className="space-y-2"><Label htmlFor="email-subject">邮件主题</Label><Input id="email-subject" value={editor.subjectTemplate} disabled={!editable} onChange={(event) => setEditor((current) => ({ ...current, subjectTemplate: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="email-html">HTML 模板</Label><Textarea id="email-html" rows={12} className="font-mono text-xs" value={editor.htmlTemplate} disabled={!editable} onChange={(event) => setEditor((current) => ({ ...current, htmlTemplate: event.target.value }))} /><p className="text-xs text-slate-500">仅作为文本编辑；页面不会执行或预览 HTML，保存时仍由服务端安全校验。</p></div>
              <div className="space-y-2"><Label htmlFor="email-text">纯文本模板</Label><Textarea id="email-text" rows={7} className="font-mono text-xs" value={editor.textTemplate} disabled={!editable} onChange={(event) => setEditor((current) => ({ ...current, textTemplate: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="email-variables">变量 Schema（JSON 对象）</Label><Textarea id="email-variables" rows={8} className="font-mono text-xs" value={editor.variablesSchema} disabled={!editable} onChange={(event) => setEditor((current) => ({ ...current, variablesSchema: event.target.value }))} /></div>

              {mode === "detail" && selected?.status !== "archived" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Label htmlFor="email-action-reason">发布 / 归档原因</Label>
                  <Textarea id="email-action-reason" rows={3} className="mt-2 bg-white" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="必填；该原因会写入审计记录" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected?.status === "draft" ? <Button onClick={() => changeStatus("publish")} disabled={submitting || !actionReason.trim()}><Send className="mr-2 h-4 w-4" />发布模板</Button> : null}
                    <Button variant="destructive" onClick={() => changeStatus("archive")} disabled={submitting || !actionReason.trim()}><Archive className="mr-2 h-4 w-4" />归档模板</Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!detailLoading ? (
            <SheetFooter className="mt-6">
              <Button variant="outline" onClick={() => setSheetOpen(false)}>关闭</Button>
              {mode === "create" ? <Button onClick={createTemplate} disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailPlus className="mr-2 h-4 w-4" />}创建草稿</Button> : selected?.status === "draft" ? <Button onClick={updateDraft} disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileEdit className="mr-2 h-4 w-4" />}保存草稿</Button> : null}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </AdminPageShell>
  );
}
