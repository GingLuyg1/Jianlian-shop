"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clipboard, FileUp, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import {
  getOrderStatusLabel,
  getPaymentStatusLabel,
  normalizeOrderStatus,
  normalizePaymentStatus,
  ORDER_STATUS_STYLES,
  PAYMENT_STATUS_STYLES,
} from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import {
  getEnabledManualPaymentMethods,
  getManualPaymentMethod,
  getPaymentErrorMessage,
} from "@/lib/payments/payment-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 3;

function formatMoney(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function safeFileName(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext.replace(/[^a-z0-9.]/g, "")}`;
}

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("order") || searchParams.get("order_no") || "";
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const methods = useMemo(() => getEnabledManualPaymentMethods(), []);
  const [paymentMethod, setPaymentMethod] = useState(methods[0]?.id ?? "");
  const [transactionReference, setTransactionReference] = useState("");
  const [userNote, setUserNote] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);

  const selectedMethod = getManualPaymentMethod(paymentMethod);
  const firstItem = order?.order_items?.[0] ?? null;
  const orderStatus = normalizeOrderStatus(order?.status);
  const paymentStatus = normalizePaymentStatus(order?.payment_status);
  const canSubmit = order && order.payment_status !== "paid" && order.status !== "cancelled";

  const loadOrder = useCallback(async () => {
    if (!orderNo) {
      setError("缺少订单编号");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`);
      const result = (await response.json().catch(() => null)) as
        | { order?: OrderRecord; error?: string }
        | null;

      if (response.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent(`/payment?order=${orderNo}`)}`);
        return;
      }

      if (!response.ok) {
        throw new Error(result?.error ?? "订单读取失败");
      }

      setOrder(result?.order ?? null);
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [orderNo, router]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("已复制");
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !order) return;
    const nextFiles = Array.from(files);
    if (proofUrls.length + nextFiles.length > MAX_FILES) {
      toast.error(`最多上传 ${MAX_FILES} 个凭证`);
      return;
    }

    const invalid = nextFiles.find((file) => !ALLOWED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) {
      toast.error("仅支持 jpg、png、webp、pdf，单文件最大 5MB");
      return;
    }

    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("请先登录");

      const uploaded: string[] = [];
      for (const file of nextFiles) {
        const storagePath = `${user.id}/${order.id}/${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        uploaded.push(storagePath);
      }

      setProofUrls((current) => [...current, ...uploaded]);
      toast.success("支付凭证已上传");
    } catch (uploadError) {
      console.error("[payment proof upload]", uploadError);
      toast.error(getPaymentErrorMessage(uploadError, "支付凭证上传失败，请检查 Storage bucket 和权限"));
    } finally {
      setUploading(false);
    }
  }

  async function submitPayment() {
    if (!order || submitting) return;
    if (!selectedMethod?.enabled) {
      setError("当前支付方式暂不可用");
      return;
    }
    if (proofUrls.length === 0 && !transactionReference.trim()) {
      setError("请上传支付凭证或填写交易参考号");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNo: order.order_no,
          paymentMethod,
          transactionReference,
          proofUrls,
          userNote,
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "支付凭证提交失败");

      toast.success("支付凭证已提交，等待人工审核");
      router.push(`/account/orders/${encodeURIComponent(order.order_no)}`);
    } catch (submitError) {
      setError(getPaymentErrorMessage(submitError, "支付凭证提交失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">提交支付凭证</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            当前为人工收款流程，管理员确认到账后订单才会更新为已支付。
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">正在读取订单...</CardContent>
          </Card>
        ) : !order ? (
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <div className="text-sm text-muted-foreground">订单不存在或无权访问。</div>
              <Button variant="outline" onClick={loadOrder}>
                <RefreshCw className="mr-2 h-4 w-4" />
                重新加载
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  支付信息
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <Info label="订单编号" value={order.order_no} copyable onCopy={() => copyText(order.order_no)} />
                  <Info label="应付金额" value={formatMoney(order.total_amount)} strong />
                  <Info label="订单状态" value={getOrderStatusLabel(order.status)} />
                  <Info label="支付状态" value={getPaymentStatusLabel(order.payment_status)} />
                </div>

                {paymentStatus === "paid" ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    订单已支付，无需重复提交凭证。
                  </div>
                ) : orderStatus === "cancelled" ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    订单已取消，不能提交支付凭证。
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>选择支付方式</Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {methods.map((method) => (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => setPaymentMethod(method.id)}
                            className={cn(
                              "rounded-xl border p-3 text-left text-sm transition-colors",
                              paymentMethod === method.id
                                ? "border-primary bg-orange-50 text-primary"
                                : "border-border bg-white hover:border-primary/50"
                            )}
                          >
                            <div className="font-medium">{method.label}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{method.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedMethod ? (
                      <div className="rounded-xl border bg-amber-50 p-4 text-sm text-amber-800">
                        <div className="font-medium">支付说明</div>
                        <ol className="mt-2 list-decimal space-y-1 pl-5">
                          {selectedMethod.instructions.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                        {selectedMethod.account ? (
                          <button
                            type="button"
                            onClick={() => copyText(selectedMethod.account!)}
                            className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-primary"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                            复制{selectedMethod.accountLabel ?? "收款信息"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="transactionReference">交易参考号</Label>
                        <Input
                          id="transactionReference"
                          value={transactionReference}
                          onChange={(event) => setTransactionReference(event.target.value)}
                          placeholder="可填写转账流水号或付款账号后四位"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>上传支付凭证</Label>
                        <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white text-sm text-muted-foreground hover:border-primary">
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                          {uploading ? "上传中..." : "选择文件"}
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            disabled={uploading || proofUrls.length >= MAX_FILES}
                            onChange={(event) => uploadFiles(event.target.files)}
                          />
                        </label>
                        <div className="text-xs text-muted-foreground">最多 3 个文件，单个不超过 5MB。</div>
                      </div>
                    </div>

                    {proofUrls.length ? (
                      <div className="rounded-xl border bg-slate-50 p-3 text-xs text-muted-foreground">
                        <div className="mb-2 font-medium text-foreground">已上传凭证</div>
                        <div className="space-y-1">
                          {proofUrls.map((url) => (
                            <div key={url} className="truncate">{url}</div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="userNote">备注</Label>
                      <Textarea
                        id="userNote"
                        value={userNote}
                        onChange={(event) => setUserNote(event.target.value)}
                        placeholder="可补充付款时间、付款人姓名等信息"
                        rows={3}
                      />
                    </div>

                    <Button type="button" disabled={!canSubmit || submitting || uploading} onClick={submitPayment}>
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {submitting ? "提交审核中..." : "提交审核"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">订单摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="font-medium text-foreground">{firstItem?.product_name ?? "订单商品"}</div>
                <Info label="数量" value={String(firstItem?.quantity ?? 1)} />
                <Info label="商品小计" value={formatMoney(firstItem?.line_total ?? order.total_amount)} />
                <Info label="创建时间" value={formatDate(order.created_at)} />
                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-muted-foreground">订单状态</span>
                  <Badge variant="outline" className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                    {getOrderStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">支付状态</span>
                  <Badge variant="outline" className={cn("text-xs", PAYMENT_STATUS_STYLES[paymentStatus])}>
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
                <div className="border-t pt-3 text-xs leading-5 text-muted-foreground">
                  凭证提交后不会自动改为已支付，需要管理员人工确认到账。
                </div>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/account/orders/${encodeURIComponent(order.order_no)}`}>查看订单详情</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

function Info({
  label,
  value,
  strong,
  copyable,
  onCopy,
}: {
  label: string;
  value: string;
  strong?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {copyable ? (
        <button type="button" onClick={onCopy} className="min-w-0 truncate font-mono font-medium text-foreground">
          {value}
        </button>
      ) : (
        <span className={cn("min-w-0 truncate text-right", strong && "font-semibold text-primary")}>{value}</span>
      )}
    </div>
  );
}
