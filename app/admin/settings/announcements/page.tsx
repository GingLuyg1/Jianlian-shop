"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Announcement = { id: string; title: string; content: string; announcement_type: string; is_enabled: boolean; starts_at: string | null; ends_at: string | null; sort_order: number; placement: string; updated_at: string };
const EMPTY_FORM = { title: "", content: "", announcementType: "info", isEnabled: false, startsAt: "", endsAt: "", sortOrder: "100", placement: "global_top" };

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/announcements", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "公告列表读取失败。");
      setItems(payload.announcements ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "公告列表读取失败。"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  function reset() { setEditingId(null); setForm(EMPTY_FORM); }
  function edit(item: Announcement) { setEditingId(item.id); setForm({ title: item.title, content: item.content, announcementType: item.announcement_type, isEnabled: item.is_enabled, startsAt: toLocalInput(item.starts_at), endsAt: toLocalInput(item.ends_at), sortOrder: String(item.sort_order), placement: item.placement }); }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "公告操作失败。");
  }

  async function submit() {
    setSaving(true);
    try {
      await post({ action: editingId ? "update" : "create", id: editingId, ...form, sortOrder: Number(form.sortOrder), startsAt: form.startsAt || null, endsAt: form.endsAt || null });
      toast.success(editingId ? "公告已更新" : "公告已创建"); reset(); await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "公告保存失败。"); }
    finally { setSaving(false); }
  }

  async function toggle(item: Announcement) {
    try { await post({ action: "toggle", id: item.id, isEnabled: !item.is_enabled }); toast.success(item.is_enabled ? "公告已停用" : "公告已启用"); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "公告状态更新失败。"); }
  }

  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 lg:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><Button asChild size="icon" variant="outline"><Link href="/admin/settings"><ArrowLeft className="h-4 w-4" /></Link></Button><div><h1 className="text-xl font-semibold text-slate-950">公告管理</h1><p className="mt-1 text-sm text-slate-500">管理公告内容、展示位置和有效时间。</p></div></div><Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}刷新</Button></div>
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="min-h-0 overflow-auto"><CardHeader className="border-b px-4 py-3"><CardTitle className="text-base">{editingId ? "编辑公告" : "新增公告"}</CardTitle></CardHeader><CardContent className="space-y-3 p-4">
        <Input placeholder="公告标题" maxLength={120} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} />
        <textarea className="h-36 w-full resize-none rounded-md border px-3 py-2 text-sm" placeholder="公告内容（纯文本）" maxLength={2000} value={form.content} onChange={(e) => setForm((v) => ({ ...v, content: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3"><select className="h-10 rounded-md border px-3 text-sm" value={form.announcementType} onChange={(e) => setForm((v) => ({ ...v, announcementType: e.target.value }))}><option value="info">普通</option><option value="warning">警告</option><option value="success">成功</option><option value="important">重要</option></select><select className="h-10 rounded-md border px-3 text-sm" value={form.placement} onChange={(e) => setForm((v) => ({ ...v, placement: e.target.value }))}><option value="global_top">全站顶部</option><option value="home">首页</option><option value="checkout">Checkout</option><option value="account">用户中心</option></select></div>
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs text-slate-500">开始时间<Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((v) => ({ ...v, startsAt: e.target.value }))} /></label><label className="space-y-1 text-xs text-slate-500">结束时间<Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((v) => ({ ...v, endsAt: e.target.value }))} /></label></div>
        <label className="space-y-1 text-xs text-slate-500">排序<Input type="number" min={0} max={9999} value={form.sortOrder} onChange={(e) => setForm((v) => ({ ...v, sortOrder: e.target.value }))} /></label>
        <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>立即启用</span><Switch checked={form.isEnabled} onCheckedChange={(checked) => setForm((v) => ({ ...v, isEnabled: checked }))} /></div>
        <div className="flex gap-2"><Button className="flex-1" disabled={saving} onClick={() => void submit()}>{saving ? "保存中..." : editingId ? "保存修改" : "创建公告"}</Button>{editingId ? <Button variant="outline" onClick={reset}>取消</Button> : null}</div>
      </CardContent></Card>
      <Card className="flex min-h-0 flex-col overflow-hidden"><CardHeader className="shrink-0 border-b px-4 py-3"><CardTitle className="text-base">公告列表</CardTitle></CardHeader><CardContent className="min-h-0 flex-1 overflow-auto p-0">{error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}{loading ? <div className="py-20 text-center text-sm text-slate-500">正在读取公告...</div> : items.length ? <div className="divide-y">{items.map((item) => <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-semibold text-slate-950">{item.title}</span><span className={`rounded-full px-2 py-0.5 text-xs ${item.is_enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_enabled ? "已启用" : "已停用"}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.content}</p><p className="mt-2 text-xs text-slate-400">{item.placement} · 排序 {item.sort_order} · 更新 {new Date(item.updated_at).toLocaleString("zh-CN")}</p></div><div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => edit(item)}>编辑</Button><Button size="sm" variant="outline" onClick={() => void toggle(item)}>{item.is_enabled ? "停用" : "启用"}</Button></div></div>)}</div> : <div className="py-20 text-center text-sm text-slate-500">暂无公告。创建后可按时间和位置展示。</div>}</CardContent></Card>
    </div>
  </div>;
}
