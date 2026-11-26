"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
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
import { usePublicAuthProfile } from "@/components/auth/AuthProfileProvider";
import { isGuestAuthUser } from "@/lib/auth/guest-user";
import { fetchCurrentLegalDocuments } from "@/lib/legal/client-legal-cache";
import { fetchWithTimeout } from "@/lib/network/fetch-with-timeout";
import { createSafeUuid } from "@/lib/browser/safe-storage";
import type { PaymentSubmitForm } from "@/lib/payments/channel-types";
import { submitPaymentForm } from "@/lib/payments/submit-payment-form.mjs";

const AirMobileProductDetails = dynamic(() => import("@/components/products/details/AirMobileProductDetails"));
const EncMobileProductDetails = dynamic(() => import("@/components/products/details/EncMobileProductDetails"));
const GiffgaffSimProductDetails = dynamic(() => import("@/components/products/details/GiffgaffSimProductDetails"));
const HahaSimProductDetails = dynamic(() => import("@/components/products/details/HahaSimProductDetails"));
const Lucky2ProductDetails = dynamic(() => import("@/components/products/details/Lucky2ProductDetails"));
const MovistarSimProductDetails = dynamic(() => import("@/components/products/details/MovistarSimProductDetails"));
const OneNzProductDetails = dynamic(() => import("@/components/products/details/OneNzProductDetails"));
const OrangeSimProductDetails = dynamic(() => import("@/components/products/details/OrangeSimProductDetails"));
const RakutenMobileProductDetails = dynamic(() => import("@/components/products/details/RakutenMobileProductDetails"));
const TMobileProductDetails = dynamic(() => import("@/components/products/details/TMobileProductDetails"));
const UltraMobileProductDetails = dynamic(() => import("@/components/products/details/UltraMobileProductDetails"));
const VodafoneSimProductDetails = dynamic(() => import("@/components/products/details/VodafoneSimProductDetails"));
import { publicMainPanelHeightClassName } from "@/components/layout/public-content";
import { getPublicStockDisplay } from "@/lib/products/delivery-and-stock";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { isLiuhaoyiAmountOverLimit, isLiuhaoyiPaymentMethod } from "@/lib/payments/liuhaoyi-limits.mjs";
import { openPublicSupport } from "@/lib/support/open-public-support";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const PRODUCT_IMAGE_FALLBACK = "/assets/jianlian-brand-logo.png";
const REQUIRED_AGREEMENT_TYPES = [
  "terms_of_service",
  "refund_policy",
  "digital_delivery_policy",
  "purchase_notice",
] as const;
const ORDER_ENABLED_PAYMENT_METHODS = new Set<PaymentMethodCode>(["balance", "usdt_bep20", "alipay", "wechat_pay"]);
const AVAILABLE_PAYMENT_OPTIONS = PAYMENT_METHOD_OPTIONS.filter((option) =>
  ORDER_ENABLED_PAYMENT_METHODS.has(option.code)
);

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

function getStockLabel(stock: number, soldOut: boolean, metadata?: unknown, deliveryType?: string | null) {
  const display = getPublicStockDisplay(stock, { deliveryType, metadata });
  if (display.code === "preorder") return display.label;
  if (soldOut) return "暂无库存";
  return display.label;
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
  icon: LucideIcon;
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
  const { user: authUser, authReady: publicAuthReady } = usePublicAuthProfile();
  const isGuestSession = isGuestAuthUser(authUser);
  const isGuestUser = !authUser || isGuestSession;
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
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    name: string;
    appliedDiscount: number;
    finalAmount: number;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [agreementChecked, setAgreementChecked] = useState(true);
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalError, setLegalError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liuhaoyiLimitDialogOpen, setLiuhaoyiLimitDialogOpen] = useState(false);
  const clientRequestIdRef = useRef("");
  const loadSeqRef = useRef(0);

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === selectedSkuId) ?? null,
    [skus, selectedSkuId]
  );
  // A failed/empty SKU response must not turn a multi-SKU product into a
  // purchasable base product with the product-level price and stock.
  const hasSkus = product?.has_skus === true || skus.length > 0;
  const categoryPath = useMemo(
    () => getCategoryPath(categories, product?.category_id ?? null),
    [categories, product?.category_id]
  );
  const unitPrice = selectedSku ? Number(selectedSku.price ?? 0) : Number(product?.price ?? 0);
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;
  const effectiveTotal = appliedCoupon ? appliedCoupon.finalAmount : totalPrice;
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
  const paymentUnavailable = !ORDER_ENABLED_PAYMENT_METHODS.has(paymentMethod);
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
  const canAttemptSubmit = Boolean(
    product &&
      !productInactive &&
      !productSoldOut &&
      !selectedSkuUnavailable &&
      !quantityInvalid &&
      isEmailLike(contactEmail) &&
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
      setAgreementChecked(true);
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
    if (typeof document === "undefined" || !product?.name) return;
    document.title = `${product.name} | Jianlian Shop`;
  }, [product?.name]);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let active = true;

    async function loadCurrentUserEmail() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const sessionUser = session?.user ?? null;
        const email = sessionUser && !isGuestAuthUser(sessionUser)
          ? sessionUser.email?.trim()
          : typeof sessionUser?.user_metadata?.contact_email === "string"
            ? sessionUser.user_metadata.contact_email.trim()
            : "";
        if (!active || !email) return;
        setContactEmail((current) => current.trim() || email);
      } catch {
        // Auth loading is non-blocking; submit still requires a valid contact email.
      }
    }

    void loadCurrentUserEmail();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadLegalDocuments() {
      setLegalLoading(true);
      setLegalError("");

      try {
        const docs = await fetchCurrentLegalDocuments();
        if (!active) return;
        setLegalDocuments(docs);
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

  useEffect(() => {
    setQuantity((current) => {
      const max = Math.max(availableStock || 1, 1);
      return Math.max(1, Math.min(max, current));
    });
  }, [availableStock]);

  useEffect(() => {
    if (publicAuthReady && isGuestUser && paymentMethod === "balance") {
      setPaymentMethod("alipay");
    }
  }, [isGuestUser, paymentMethod, publicAuthReady]);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError("");
  }, [product?.id, selectedSkuId, quantity]);

  async function handleApplyCoupon() {
    const trimmed = couponCode.trim().toUpperCase();
    if (!trimmed) {
      setCouponError("请输入优惠券码");
      return;
    }
    if (totalPrice <= 0) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const response = await fetchWithTimeout("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, orderAmount: totalPrice }),
      });
      const payload = (await response.json().catch(() => null)) as {
        valid?: boolean;
        error?: string;
        coupon?: { code: string; name: string; appliedDiscount: number; finalAmount: number };
      } | null;
      if (!response.ok || !payload?.valid || !payload.coupon) {
        setAppliedCoupon(null);
        setCouponError(payload?.error || "优惠券不可用");
        return;
      }
      setCouponCode(payload.coupon.code);
      setAppliedCoupon(payload.coupon);
      setCouponError("");
      toast.success(`已使用优惠券，立减 ¥${payload.coupon.appliedDiscount.toFixed(2)}`);
    } catch {
      setAppliedCoupon(null);
      setCouponError("优惠券校验失败，请稍后重试");
    } finally {
      setCouponLoading(false);
    }
  }

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
    if (!isEmailLike(contactEmail)) return "请先填写有效的联系邮箱，用于接收卡密与通知。";
    if (isGuestUser && paymentMethod === "balance") return "余额支付需先登录；游客可直接选择支付宝 / 微信支付 / USDT 下单。";
    if (paymentUnavailable) return "该支付方式暂未开放，请选择支付宝、微信支付、余额或 USDT-BEP20。";
    if (legalLoading) return "协议正在加载，请稍后再试。";
    if (legalError) return legalError;
    if (!agreementsReady) return "协议版本未配置完整，请稍后重试。";
    if (!agreementChecked) return "请先阅读并确认商品说明、购买须知和订单协议。";
    return "";
  }

  const submitLockRef = useRef(false);

  async function handleSubmit() {
    if (submitting || submitLockRef.current) return;
    if (isLiuhaoyiPaymentMethod(paymentMethod) && isLiuhaoyiAmountOverLimit(effectiveTotal)) {
      setLiuhaoyiLimitDialogOpen(true);
      return;
    }
    const validationError = validateSubmit();
    if (validationError) {
      setSubmitError(validationError);
      toast.warning(validationError);
      return;
    }
    if (!product) return;

    submitLockRef.current = true;
    setSubmitError("");
    setSubmitting(true);
    try {
      if (!authUser?.id && paymentMethod !== "balance") {
        const guestRes = await fetchWithTimeout("/api/auth/guest-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: contactEmail.trim() }),
        });
        const guestPayload = (await guestRes.json().catch(() => null)) as { error?: string } | null;
        if (!guestRes.ok) {
          throw new Error(guestPayload?.error || "游客下单通道初始化失败，请稍后重试或登录购买");
        }
      }

      if (!clientRequestIdRef.current) {
        clientRequestIdRef.current = createSafeUuid();
      }

      const activeCouponCode = appliedCoupon?.code ?? (couponCode.trim() ? couponCode.trim().toUpperCase() : "");
      const response = await fetchWithTimeout("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          sku_id: selectedSku?.id ?? null,
          quantity,
          contact_email: contactEmail.trim(),
          customer_email: contactEmail.trim(),
          payment_method: paymentMethod,
          ...(activeCouponCode ? { coupon_code: activeCouponCode } : {}),
          agreement_version_ids: agreementPayload,
          agreements: agreementPayload,
          client_request_id: clientRequestIdRef.current,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            order?: { order_no?: string };
            error?: string;
            paymentSession?: { paymentType?: string; paymentUrl?: string; submitForm?: PaymentSubmitForm };
          }
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
      if (payload?.paymentSession?.submitForm && submitPaymentForm(payload.paymentSession.submitForm)) return;
      if (payload?.paymentSession?.paymentType === "redirect" && payload.paymentSession.paymentUrl) {
        window.location.assign(payload.paymentSession.paymentUrl);
        return;
      }
      router.push(`/payment?order=${encodeURIComponent(orderNo)}`);
    } catch (error) {
      const msg = getErrorText(error, "订单创建失败，请稍后重试");
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout contentClassName="max-w-none px-4 py-3 md:px-6">
      <div
        data-testid="product-detail-shell"
        className="mx-auto w-full max-w-[1668px] overflow-visible"
      >
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
          <div
            data-testid="product-detail-grid"
            className={`grid gap-5 overflow-visible md:min-h-0 md:overflow-hidden lg:grid-cols-[minmax(0,1fr)_386px] lg:items-stretch ${publicMainPanelHeightClassName}`}
          >
            <div
              data-testid="product-detail-left"
              className="min-h-0 min-w-0 space-y-5 overflow-visible px-1 sidebar-scroll md:h-full md:overflow-x-hidden md:overflow-y-auto md:[scrollbar-gutter:stable_both-edges]"
            >
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                返回上一页
              </button>

              <Card>
                <CardContent className="grid gap-5 p-5 sm:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="aspect-square overflow-hidden rounded-2xl border border-orange-100 bg-white">
                    <img
                      src={selectedSku?.image_url || product.image_url || PRODUCT_IMAGE_FALLBACK}
                      alt={product.name}
                      fetchPriority="high"
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
                      {deliveryType === "shipping" ? (
                        <Badge variant="outline" className="border-orange-200 bg-orange-50 font-semibold text-primary">
                          下单24小时内发货
                        </Badge>
                      ) : null}
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

              {((product.name.toLowerCase().includes("giffgaff") || (product.slug || "").includes("giffgaff") || (product.slug || "").startsWith("sim-00")) &&
                !product.name.includes("充值") &&
                !(product.slug || "").includes("topup")) ? (
                <GiffgaffSimProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("one nz") || (product.slug || "").includes("one-nz") || (product.slug || "") === "sim-one-nz" || (product.slug || "") === "sim-nz-001") ? (
                <OneNzProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("haha") || (product.slug || "").includes("haha") || (product.slug || "") === "sim-haha") ? (
                <HahaSimProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("lucky") || (product.slug || "").includes("lucky")) ? (
                <Lucky2ProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("t-mobile") || (product.slug || "").includes("t-mobile")) ? (
                <TMobileProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("ultra") || (product.slug || "").includes("ultra")) ? (
                <UltraMobileProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("air mobile") || (product.slug || "").includes("air-mobile")) ? (
                <AirMobileProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("enc") || (product.slug || "").includes("enc")) ? (
                <EncMobileProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("orange") || (product.slug || "").includes("orange")) ? (
                <OrangeSimProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("vodafone") || (product.slug || "").includes("vodafone")) ? (
                <VodafoneSimProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("movistar") || (product.slug || "").includes("movistar")) ? (
                <MovistarSimProductDetails product={product} />
              ) : (product.name.toLowerCase().includes("rakuten") || (product.slug || "").includes("rakuten") || product.name.includes("乐天")) ? (
                <RakutenMobileProductDetails product={product} />
              ) : (
                <>
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
                          desc={getDeliveryLabel(deliveryType, product?.metadata)}
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
                </>
              )}
            </div>

            <aside className="flex min-h-0 min-w-0 overflow-visible md:h-full md:overflow-hidden">
              <Card
                data-testid="product-detail-purchase-card"
                className="flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden md:h-full md:max-h-full"
              >
                <CardHeader className="shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">商品购买</CardTitle>
                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="shrink-0 text-sm text-muted-foreground hover:text-primary"
                    >
                      返回首页
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto pb-5 pr-4 sidebar-scroll">
                  {skuError ? (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {skuError}
                    </div>
                  ) : null}

                  {hasSkus && skus.length >= 2 ? (
                    <>
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
                                  {getPublicStockDisplay(sku.stock, {
                                    deliveryType: sku.delivery_type ?? product.delivery_type,
                                    metadata: sku.metadata ?? product.metadata,
                                  }).label}
                                  {disabled ? "，暂不可购买" : ""}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50/40 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">规格单价</span>
                        <span className="text-xl font-black text-primary">
                          {formatPrice(settings.currency_symbol, unitPrice)}
                        </span>
                      </div>
                    </>
                  ) : null}

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
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        <span className="text-red-500">*</span>联系邮箱
                      </span>
                      {publicAuthReady && isGuestUser ? (
                        <span className="text-[11px] text-primary">支持免登录游客下单</span>
                      ) : null}
                    </div>
                    <Input
                      value={contactEmail}
                      onChange={(event) => {
                        setContactEmail(event.target.value);
                        if (submitError) setSubmitError("");
                      }}
                      placeholder="请输入接收通知或卡密的邮箱"
                      className="h-11 bg-white"
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">优惠券（可选）</div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={couponCode}
                        onChange={(event) => {
                          setCouponCode(event.target.value);
                          if (appliedCoupon) setAppliedCoupon(null);
                          if (couponError) setCouponError("");
                        }}
                        maxLength={40}
                        placeholder="请输入优惠券码"
                        className="h-10 flex-1 bg-white"
                        disabled={submitting || couponLoading}
                      />
                      {appliedCoupon ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 shrink-0 px-3"
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponCode("");
                            setCouponError("");
                          }}
                        >
                          取消
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 shrink-0 px-3"
                          disabled={submitting || couponLoading || !couponCode.trim()}
                          onClick={() => void handleApplyCoupon()}
                        >
                          {couponLoading ? "核验中" : "使用"}
                        </Button>
                      )}
                    </div>
                    {appliedCoupon ? (
                      <p className="mt-1.5 text-xs font-medium text-emerald-700">
                        已使用 {appliedCoupon.name}，立减 {formatPrice(settings.currency_symbol, appliedCoupon.appliedDiscount)}
                      </p>
                    ) : couponError ? (
                      <p className="mt-1.5 text-xs text-red-600">{couponError}</p>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium">支付方式</div>
                    <select
                      value={paymentMethod}
                      onChange={(event) => {
                        setPaymentMethod(event.target.value as PaymentMethodCode);
                        if (submitError) setSubmitError("");
                      }}
                      className="h-11 w-full rounded-xl border border-orange-100 bg-white px-3 text-base md:text-sm outline-none focus:border-primary"
                      disabled={submitting}
                    >
                      {AVAILABLE_PAYMENT_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedPaymentOption?.description ? (
                      <p className="mt-2 text-xs text-muted-foreground">{selectedPaymentOption.description}</p>
                    ) : null}
                  </div>

                  <div
                    data-testid="product-detail-total-summary"
                    className="space-y-1.5 rounded-xl border border-orange-100 bg-orange-50/60 px-3.5 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>商品金额（{formatPrice(settings.currency_symbol, unitPrice)} × {quantity}）</span>
                      <span className="tabular-nums">{formatPrice(settings.currency_symbol, totalPrice)}</span>
                    </div>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between text-xs text-emerald-700">
                        <span>优惠券抵扣</span>
                        <span className="tabular-nums">-{formatPrice(settings.currency_symbol, appliedCoupon.appliedDiscount)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-orange-200/60 pt-1.5 font-semibold text-slate-900">
                      <span>应付总价</span>
                      <span className="text-xl font-black text-primary tabular-nums">
                        {formatPrice(settings.currency_symbol, effectiveTotal)}
                      </span>
                    </div>
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

                  <Button
                    className="h-11 w-full font-semibold"
                    disabled={submitting || productInactive || productSoldOut || selectedSkuUnavailable}
                    onClick={handleSubmit}
                  >
                    {submitting
                      ? "正在创建订单..."
                      : productInactive
                        ? "商品已下架"
                        : productSoldOut || selectedSkuUnavailable
                          ? "暂无库存"
                          : `立即购买 · ${formatPrice(settings.currency_symbol, effectiveTotal)}`}
                  </Button>
                  <Button asChild variant="outline" className="h-10 w-full text-xs">
                    <Link
                      href={`/checkout?p=${encodeURIComponent(product.slug || product.id)}${selectedSku ? `&sku=${encodeURIComponent(selectedSku.id)}` : ""}&qty=${quantity}${appliedCoupon ? `&coupon=${encodeURIComponent(appliedCoupon.code)}` : ""}`}
                    >
                      前往完整结算页（支持更多说明与物流填写）
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </div>
      <Dialog open={liuhaoyiLimitDialogOpen} onOpenChange={setLiuhaoyiLimitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>支付宝/微信支付金额超限</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">支付金额大于2000联系人工客服处理。支付宝/微信单笔支付最高支持 ¥2000。金额较大时建议分次充值后使用余额支付，如需协助请联系客服。</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setLiuhaoyiLimitDialogOpen(false)}>取消</Button>
            <Button variant="outline" onClick={() => { setLiuhaoyiLimitDialogOpen(false); openPublicSupport(); }}>联系客服</Button>
            <Button variant="outline" onClick={() => { setPaymentMethod("balance"); setLiuhaoyiLimitDialogOpen(false); }}>使用余额支付</Button>
            <Button onClick={() => router.push("/products/account-recharge")}>去充值</Button>
          </div>
        </DialogContent>
      </Dialog>
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
          <Button variant="outline" onClick={() => window.location.assign("/")}>
            返回首页
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
