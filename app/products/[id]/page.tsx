"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Headphones,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FRONTEND_ACTIVE_PRODUCT_STATUS,
  getDeliveryLabel,
  getErrorText,
  getProductDetailPath,
  getPublicProductDetail,
  listPublicCategories,
  type PublicCategory,
  type PublicProductRow,
  type PublicProductSkuRow,
} from "@/lib/supabase/public-catalog";
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import { cn } from "@/lib/utils";

const PRODUCT_IMAGE_FALLBACK = "/assets/jianlian-brand-logo.png";
const REQUIRED_AGREEMENT_TYPES = [
  "terms_of_service",
  "refund_policy",
  "digital_delivery_policy",
  "purchase_notice",
] as const;

type LegalDocument = {
  id: string;
  document_type: string;
  version?: string;
  title?: string;
  content_hash: string;
};

type PageStatus = "loading" | "ready" | "not_found" | "read_failed";

function setProductImageFallback(image: HTMLImageElement) {
  if (image.src.endsWith(PRODUCT_IMAGE_FALLBACK)) return;
  image.src = PRODUCT_IMAGE_FALLBACK;
}

function getCategoryPath(categories: PublicCategory[], categoryId: string | null) {
  if (!categoryId) return "未分类";

  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: PublicCategory[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId) ?? null;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) ?? null : null;
  }

  return path.length > 0 ? path.map((category) => category.name).join(" / ") : "未分类";
}

function formatPrice(symbol: string, value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return `${symbol}${Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00"}`;
}

function getSkuLabel(sku: PublicProductSkuRow, index: number) {
  return sku.sku_title || sku.sku_code || `规格 ${index + 1}`;
}

function getStockLabel(stock: number, soldOut: boolean) {
  if (soldOut || stock <= 0) return "已售罄";
  if (stock <= 10) return "低库存";
  return "有库存";
}

function getStatusLabel(product: PublicProductRow, soldOut: boolean) {
  if (product.status === FRONTEND_ACTIVE_PRODUCT_STATUS && !soldOut) return "可购买";
  if (product.status === "sold_out" || soldOut) return "已售罄";
  return "已下架";
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function InfoItem({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof ShieldCheck;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-2 font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</div>
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { settings } = usePublicSettings();
  const routeId = params?.id;
  const productIdentifier = Array.isArray(routeId) ? routeId[0] : routeId;

  const [status, setStatus] = useState<PageStatus>("loading");
  const [product, setProduct] = useState<PublicProductRow | null>(null);
  const [skus, setSkus] = useState<PublicProductSkuRow[]>([]);
  const [skuError, setSkuError] = useState("");
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [readError, setReadError] = useState("");
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>(DEFAULT_PAYMENT_METHOD);
  const [contactEmail, setContactEmail] = useState("");
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalError, setLegalError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const clientRequestIdRef = useRef("");
  const loadSeqRef = useRef(0);

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === selectedSkuId) ?? null,
    [skus, selectedSkuId]
  );
  const hasSkus = skus.length > 0;
  const categoryPath = useMemo(
    () => getCategoryPath(categories, product?.category_id ?? null),
    [categories, product?.category_id]
  );
  const unitPrice = selectedSku ? Number(selectedSku.price ?? 0) : Number(product?.price ?? 0);
  const originalPrice = selectedSku ? selectedSku.original_price : product?.original_price ?? null;
  const availableStock = selectedSku ? Number(selectedSku.stock ?? 0) : Number(product?.stock ?? 0);
  const deliveryType = selectedSku?.delivery_type || product?.delivery_type || "manual";
  const productInactive = Boolean(
    product && product.status !== FRONTEND_ACTIVE_PRODUCT_STATUS && product.status !== "sold_out"
  );
  const productSoldOut = Boolean(product && (product.status === "sold_out" || availableStock <= 0));
  const selectedSkuUnavailable = Boolean(
    hasSkus &&
      (!selectedSku ||
        selectedSku.status !== FRONTEND_ACTIVE_PRODUCT_STATUS ||
        Number(selectedSku.stock ?? 0) <= 0)
  );
  const requiredAgreementDocs = REQUIRED_AGREEMENT_TYPES.map((type) =>
    legalDocuments.find((doc) => doc.document_type === type)
  );
  const agreementsReady = requiredAgreementDocs.every(Boolean);
  const agreementPayload = requiredAgreementDocs.filter(Boolean).map((doc) => ({
    document_type: doc!.document_type,
    document_version_id: doc!.id,
    content_hash: doc!.content_hash,
  }));
  const selectedPaymentOption = PAYMENT_METHOD_OPTIONS.find((option) => option.code === paymentMethod);
  const paymentUnavailable = paymentMethod !== "balance";
  const quantityInvalid = quantity < 1 || quantity > Math.max(availableStock, 0);

  const canSubmit = Boolean(
    product &&
      !productInactive &&
      !productSoldOut &&
      !selectedSkuUnavailable &&
      !quantityInvalid &&
      isEmailLike(contactEmail) &&
      !paymentUnavailable &&
      agreementChecked &&
      !legalLoading &&
      !legalError &&
      agreementsReady &&
      !submitting
  );

  async function loadProduct() {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;

    if (!productIdentifier) {
      setStatus("read_failed");
      setReadError("商品参数无效");
      return;
    }

    setStatus("loading");
    setReadError("");
    setSkuError("");
    setSubmitError("");

    try {
      const [detail, categoryRows] = await Promise.all([
        getPublicProductDetail(productIdentifier),
        listPublicCategories(),
      ]);
      if (loadSeqRef.current !== seq) return;

      if (!detail?.product) {
        setProduct(null);
        setSkus([]);
        setCategories(categoryRows);
        setStatus("not_found");
        return;
      }

      const firstPurchasableSku = detail.skus.find(
        (sku) => sku.status === FRONTEND_ACTIVE_PRODUCT_STATUS && Number(sku.stock ?? 0) > 0
      );
      const firstVisibleSku = detail.skus[0];
      setProduct(detail.product);
      setSkus(detail.skus);
      setSkuError(detail.sku_error ?? "");
      setCategories(categoryRows);
      setSelectedSkuId(firstPurchasableSku?.id ?? firstVisibleSku?.id ?? "");
      setQuantity(1);
      setAgreementChecked(false);
      setPaymentMethod(DEFAULT_PAYMENT_METHOD);
      setStatus("ready");
    } catch (error) {
      if (loadSeqRef.current !== seq) return;
      setProduct(null);
      setSkus([]);
      setStatus("read_failed");
      setReadError(getErrorText(error, "商品读取失败，请重试"));
    }
  }

  useEffect(() => {
    void loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdentifier]);

  useEffect(() => {
    let active = true;

    async function loadLegalDocuments() {
      setLegalLoading(true);
      setLegalError("");

      try {
        const response = await fetch("/api/legal/current", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { documents?: LegalDocument[]; error?: string }
          | null;

        if (!response.ok) throw new Error(payload?.error || "协议读取失败，请稍后重试");
        if (!active) return;
        setLegalDocuments(Array.isArray(payload?.documents) ? payload!.documents! : []);
      } catch (error) {
        if (!active) return;
        setLegalError(getErrorText(error, "协议读取失败，请稍后重试"));
        setLegalDocuments([]);
      } finally {
        if (active) setLegalLoading(false);
      }
    }

    void loadLegalDocuments();
    return () => {
      active = false;
    };
  }, []);

  function changeQuantity(next: number) {
    const max = Math.max(1, availableStock || 1);
    setQuantity(Math.max(1, Math.min(max, Math.floor(next))));
  }

  function validateSubmit() {
    if (!product) return "商品尚未加载完成";
    if (productInactive) return "商品已下架，暂不支持购买。";
    if (productSoldOut) return "商品已售罄，暂不支持购买。";
    if (hasSkus && !selectedSku) return "请先选择完整商品规格。";
    if (selectedSkuUnavailable) return "当前规格不可购买，请重新选择。";
    if (quantityInvalid) return "购买数量超出当前库存。";
    if (!isEmailLike(contactEmail)) return "请填写有效的联系邮箱。";
    if (paymentUnavailable) return "该支付方式暂未开放，请选择余额支付。";
    if (legalLoading) return "协议正在加载，请稍后再试。";
    if (legalError) return legalError;
    if (!agreementsReady) return "协议版本未配置完整，请稍后重试。";
    if (!agreementChecked) return "请先阅读并确认商品说明、购买须知和订单协议。";
    return "";
  }

  async function handleSubmit() {
    if (submitting) return;
    const validationError = validateSubmit();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    if (!product) return;

    setSubmitError("");
    setSubmitting(true);
    try {
      if (!clientRequestIdRef.current) {
        clientRequestIdRef.current =
          typeof window !== "undefined" && window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `detail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          sku_id: selectedSku?.id ?? null,
          quantity,
          customer_email: contactEmail.trim(),
          payment_method: paymentMethod,
          agreement_version_ids: agreementPayload,
          agreements: agreementPayload,
          client_request_id: clientRequestIdRef.current,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { order?: { order_no?: string }; error?: string }
        | null;

      if (response.status === 401) {
        router.push(
          `/login?redirect=${encodeURIComponent(getProductDetailPath({ id: product.id, slug: product.slug }))}`
        );
        return;
      }
      if (!response.ok) throw new Error(payload?.error || "订单创建失败，请稍后重试");

      const orderNo = payload?.order?.order_no;
      if (!orderNo) throw new Error("订单创建失败，请稍后重试");
      router.push(`/payment?order=${encodeURIComponent(orderNo)}`);
    } catch (error) {
      setSubmitError(getErrorText(error, "订单创建失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1420px] px-4 py-5 lg:px-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回上一页
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            返回首页
          </button>
        </div>

        {status === "loading" ? (
          <Card>
            <CardContent className="p-8">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
                <div className="space-y-4">
                  <div className="h-80 animate-pulse rounded-2xl bg-orange-50" />
                  <div className="h-32 animate-pulse rounded-2xl bg-orange-50" />
                </div>
                <div className="h-96 animate-pulse rounded-2xl bg-orange-50" />
              </div>
            </CardContent>
          </Card>
        ) : status === "read_failed" ? (
          <StateCard title="商品读取失败" description={readError} tone="error" onRetry={loadProduct} />
        ) : status === "not_found" || !product ? (
          <StateCard
            title="商品不存在"
            description="当前商品可能已删除，或链接已失效。"
            tone="warning"
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
            <main className="min-w-0 space-y-5">
              <Card>
                <CardContent className="grid gap-5 p-5 sm:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="aspect-square overflow-hidden rounded-2xl border border-orange-100 bg-white">
                    <img
                      src={selectedSku?.image_url || product.image_url || PRODUCT_IMAGE_FALLBACK}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      onError={(event) => setProductImageFallback(event.currentTarget)}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 text-xs text-muted-foreground">{categoryPath}</div>
                    <h1 className="break-words text-2xl font-black leading-tight text-slate-950">
                      {product.name}
                    </h1>
                    {product.short_description ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {product.short_description}
                      </p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className="text-3xl font-black text-primary">
                        {formatPrice(settings.currency_symbol, unitPrice)}
                      </span>
                      {settings.show_original_price && originalPrice ? (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(settings.currency_symbol, originalPrice)}
                        </span>
                      ) : null}
                      {settings.show_stock ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            productSoldOut
                              ? "border-slate-200 bg-slate-50 text-slate-500"
                              : "border-green-200 bg-green-50 text-green-700"
                          )}
                        >
                          {getStockLabel(availableStock, productSoldOut)}：{availableStock}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="border-orange-200 bg-orange-50 text-primary">
                        {getDeliveryLabel(deliveryType)}
                      </Badge>
                      <Badge variant="outline" className="border-orange-200 bg-white text-primary">
                        {getStatusLabel(product, productSoldOut)}
                      </Badge>
                    </div>

                    {productInactive ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        商品已下架，暂不支持购买。
                      </div>
                    ) : productSoldOut ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        商品已售罄，可查看详情但暂不支持下单。
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">商品说明</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                  <p>
                    {product.description ||
                      product.short_description ||
                      "该商品暂未填写详细说明，下单前如需确认更多信息，请联系在线客服。"}
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoItem
                      icon={ShieldCheck}
                      title="安全合规"
                      desc="下单前请核对商品用途，非商品问题不支持退换。"
                    />
                    <InfoItem
                      icon={PackageCheck}
                      title="交付方式"
                      desc={getDeliveryLabel(deliveryType)}
                    />
                    <InfoItem
                      icon={Headphones}
                      title="售后支持"
                      desc="有疑问请先联系在线客服确认。"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">购买须知</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>1. 下单前请确认商品名称、规格、库存状态和交付方式。</p>
                  <p>2. 账号、卡密和数字交付类商品属于一次性商品，售出后不支持无理由退换。</p>
                  <p>3. 商品库存、价格和 SKU 状态以服务端创建订单时重新校验结果为准。</p>
                </CardContent>
              </Card>
            </main>

            <aside className="min-w-0">
              <Card className="lg:sticky lg:top-24">
                <CardHeader>
                  <CardTitle className="text-base">商品购买</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {skuError ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {skuError}
                    </div>
                  ) : null}

                  {hasSkus ? (
                    <div>
                      <div className="mb-2 text-sm font-medium">商品规格</div>
                      <div className="grid gap-2">
                        {skus.map((sku, index) => {
                          const disabled =
                            sku.status !== FRONTEND_ACTIVE_PRODUCT_STATUS || Number(sku.stock ?? 0) <= 0;
                          const active = sku.id === selectedSkuId;

                          return (
                            <button
                              key={sku.id}
                              type="button"
                              disabled={disabled || submitting}
                              onClick={() => {
                                setSelectedSkuId(sku.id);
                                setQuantity(1);
                                setSubmitError("");
                              }}
                              className={cn(
                                "rounded-xl border px-3 py-2 text-left transition",
                                active
                                  ? "border-primary bg-orange-50 text-primary shadow-sm"
                                  : "border-orange-100 bg-white hover:border-primary/50",
                                disabled ? "cursor-not-allowed opacity-50" : ""
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold">{getSkuLabel(sku, index)}</span>
                                <span>{formatPrice(settings.currency_symbol, sku.price)}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                库存：{Number(sku.stock ?? 0)}
                                {disabled ? "，暂不可购买" : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2 text-sm text-muted-foreground">
                      单规格商品，可直接下单。
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">商品单价</span>
                    <span className="text-xl font-black text-primary">
                      {formatPrice(settings.currency_symbol, unitPrice)}
                    </span>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">购买数量</div>
                    <div className="flex w-36 items-center rounded-xl border border-orange-100 bg-white">
                      <button
                        type="button"
                        className="px-3 py-2 disabled:opacity-40"
                        onClick={() => changeQuantity(quantity - 1)}
                        disabled={quantity <= 1 || submitting}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <Input className="h-9 border-0 text-center shadow-none" value={quantity} readOnly />
                      <button
                        type="button"
                        className="px-3 py-2 disabled:opacity-40"
                        onClick={() => changeQuantity(quantity + 1)}
                        disabled={quantity >= availableStock || submitting || productSoldOut}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">联系邮箱</div>
                    <Input
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder="请输入接收通知或卡密的邮箱"
                      className="h-11 bg-white"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">支付方式</div>
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as PaymentMethodCode)}
                      className="h-11 w-full rounded-xl border border-orange-100 bg-white px-3 text-sm outline-none focus:border-primary"
                      disabled={submitting}
                    >
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code} disabled={option.code !== "balance"}>
                          {option.label}
                          {option.code === "balance" ? "" : "（暂未开放）"}
                        </option>
                      ))}
                    </select>
                    {selectedPaymentOption?.description ? (
                      <p className="mt-2 text-xs text-muted-foreground">{selectedPaymentOption.description}</p>
                    ) : null}
                    {paymentUnavailable ? (
                      <p className="mt-2 text-xs text-amber-700">
                        该支付方式暂未开放，不会生成二维码、钱包地址或假支付结果。
                      </p>
                    ) : null}
                  </div>

                  <label className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={agreementChecked}
                      onChange={(event) => setAgreementChecked(event.target.checked)}
                      disabled={submitting || legalLoading || Boolean(legalError)}
                    />
                    <span>我已阅读并确认商品说明、购买须知、退款政策和订单协议。</span>
                  </label>

                  {legalLoading ? (
                    <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-sm text-muted-foreground">
                      协议加载中...
                    </div>
                  ) : null}
                  {legalError ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      {legalError}
                    </div>
                  ) : null}
                  {!legalLoading && !legalError && !agreementsReady ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      协议版本未配置完整，请稍后重试。
                    </div>
                  ) : null}
                  {submitError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {submitError}
                    </div>
                  ) : null}

                  <Button className="h-11 w-full" disabled={!canSubmit} onClick={handleSubmit}>
                    {submitting ? "正在创建订单..." : "立即购买"}
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

function StateCard({
  title,
  description,
  tone,
  onRetry,
}: {
  title: string;
  description: string;
  tone: "error" | "warning";
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <AlertCircle
          className={cn("mx-auto h-10 w-10", tone === "error" ? "text-red-500" : "text-amber-500")}
        />
        <h1 className="mt-4 text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-center gap-3">
          {onRetry ? (
            <Button onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新加载
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => window.location.assign("/")}>返回首页</Button>
        </div>
      </CardContent>
    </Card>
  );
}