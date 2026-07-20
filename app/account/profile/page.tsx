"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileForm = {
  email: string;
  display_name: string;
  phone: string;
  recipient_name: string;
  address_region: string;
  address_line: string;
  avatar_url: string;
};

type FieldErrors = Partial<Record<keyof ProfileForm | "avatar", string>>;

const emptyForm: ProfileForm = {
  email: "",
  display_name: "",
  phone: "",
  recipient_name: "",
  address_region: "",
  address_line: "",
  avatar_url: "",
};

function getInitial(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "J";
}

function isValidPhone(value: string) {
  if (!value.trim()) return true;
  return /^[+0-9()\-\s]{6,24}$/.test(value.trim());
}

function sanitizeError() {
  return "资料保存失败，请检查填写内容后重试。";
}

type ApiProfile = {
  email?: string | null;
  display_name?: string | null;
  phone?: string | null;
  recipient_name?: string | null;
  shipping_address?: Record<string, unknown> | null;
  avatar_url?: string | null;
};

async function fetchProfileOnce() {
  const response = await fetch("/api/account/profile", { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as {
    profile?: ApiProfile | null;
    exists?: boolean;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || "资料加载失败。");
  return body;
}

async function fileToWebp(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - size) / 2);
  const sy = Math.floor((bitmap.height - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, sx, sy, size, size, 0, 0, 512, 512);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("webp failed"))), "image/webp", 0.88);
  });
}

export default function AccountProfilePage() {
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");

  const displayInitial = useMemo(() => getInitial(form.display_name || form.email), [form.display_name, form.email]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setFormError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFormError("请先登录后查看个人资料。");
        setForm(emptyForm);
        return;
      }

      setUserId(user.id);
      let body = await fetchProfileOnce();
      if (!body.exists) {
        const createResponse = await fetch("/api/account/profile", { method: "POST", cache: "no-store" });
        const createBody = (await createResponse.json().catch(() => ({}))) as {
          profile?: ApiProfile | null;
          error?: string;
        };
        if (!createResponse.ok) throw new Error(createBody.error || "资料初始化失败。");
        body = { ...createBody, exists: Boolean(createBody.profile) };
      }

      if (!body.profile) {
        setFormError("资料加载失败，请确认已执行用户资料字段 SQL。");
        setForm({ ...emptyForm, email: user.email ?? "" });
      } else {
        const data = body.profile;
        const address = data.shipping_address && typeof data.shipping_address === "object"
          ? data.shipping_address
          : {};
        setForm({
          email: String(data?.email ?? user.email ?? ""),
          display_name: String(data?.display_name ?? ""),
          phone: String(data?.phone ?? ""),
          recipient_name: String(data?.recipient_name ?? ""),
          address_region: typeof address.region === "string" ? address.region : "",
          address_line: typeof address.address === "string" ? address.address : "",
          avatar_url: String(data?.avatar_url ?? ""),
        });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "资料加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setErrors((current) => ({ ...current, avatar: undefined }));
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((current) => ({ ...current, avatar: "仅支持 jpg、jpeg、png、webp 图片。" }));
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, avatar: "头像文件不能超过 2MB。" }));
      event.target.value = "";
      return;
    }
    setAvatarFile(file);
  }

  function validate() {
    const nextErrors: FieldErrors = {};
    if (!form.display_name.trim()) nextErrors.display_name = "显示名称不能为空。";
    if (!isValidPhone(form.phone)) nextErrors.phone = "联系电话格式不正确。";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadAvatar() {
    if (!avatarFile || !userId) return form.avatar_url;
    try {
      const webp = await fileToWebp(avatarFile);
      const path = `${userId}/avatar.webp`;
      const { error } = await getSupabaseBrowserClient().storage
        .from("avatars")
        .upload(path, webp, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: true,
        });
      if (error) throw error;
      const { data } = getSupabaseBrowserClient().storage.from("avatars").getPublicUrl(path);
      return data.publicUrl;
    } catch {
      setErrors((current) => ({ ...current, avatar: "头像上传失败，其他资料仍可保存。" }));
      return form.avatar_url;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !validate() || !userId) return;
    setSaving(true);
    setFormError("");

    const avatarUrl = await uploadAvatar();
    const payload = {
      display_name: form.display_name.trim(),
      phone: form.phone.trim() || null,
      recipient_name: form.recipient_name.trim() || null,
      shipping_address: {
        region: form.address_region.trim(),
        address: form.address_line.trim(),
        recipient: form.recipient_name.trim(),
        phone: form.phone.trim(),
      },
      avatar_url: avatarUrl || null,
    };

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { profile?: ApiProfile; error?: string };

    setSaving(false);

    if (!response.ok) {
      setFormError(body.error || sanitizeError());
      setErrors((current) => ({ ...current, display_name: current.display_name }));
      return;
    }

    setForm((current) => ({ ...current, avatar_url: avatarUrl || current.avatar_url }));
    setAvatarFile(null);
    toast.success("个人资料已保存。");
  }

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">个人资料</CardTitle>
        <p className="text-sm text-muted-foreground">维护你的联系信息、常用收件信息和头像。</p>
      </CardHeader>
      <CardContent className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid min-h-0 min-w-0 flex-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-full min-w-0 flex-col gap-4">
            {formError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border bg-orange-50">
                {avatarPreview || form.avatar_url ? (
                  <img src={avatarPreview || form.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-primary">
                    {displayInitial}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="avatar" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Camera className="h-4 w-4" />
                  选择头像
                </Label>
                <Input id="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarChange} />
                <p className="mt-2 text-xs text-muted-foreground">支持 jpg、jpeg、png、webp，最大 2MB，保存时按 1:1 上传。</p>
                {errors.avatar ? <p className="mt-1 text-xs text-red-600">{errors.avatar}</p> : null}
              </div>
            </div>

            <div className="grid min-h-0 min-w-0 flex-1 gap-4 md:grid-cols-2">
              <Field label="登录邮箱" htmlFor="email">
                <Input id="email" value={form.email} readOnly className="bg-slate-50" />
              </Field>
              <Field label="显示名称" htmlFor="display_name" error={errors.display_name}>
                <Input id="display_name" value={form.display_name} onChange={(event) => updateField("display_name", event.target.value)} required />
              </Field>
              <Field label="联系电话" htmlFor="phone" error={errors.phone}>
                <Input id="phone" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="+1 555..." />
              </Field>
              <Field label="常用收件人" htmlFor="recipient_name">
                <Input id="recipient_name" value={form.recipient_name} onChange={(event) => updateField("recipient_name", event.target.value)} />
              </Field>
              <Field label="地址区域" htmlFor="address_region">
                <Input id="address_region" value={form.address_region} onChange={(event) => updateField("address_region", event.target.value)} placeholder="国家 / 州省 / 城市" />
              </Field>
              <Field label="常用地址" htmlFor="address_line" className="md:col-span-2">
                <Textarea id="address_line" rows={5} className="min-h-[128px] max-w-full resize-none" value={form.address_line} onChange={(event) => updateField("address_line", event.target.value)} />
              </Field>
            </div>

            <div className="mt-auto flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {saving ? "保存中..." : "保存资料"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  children,
  className,
  error,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

