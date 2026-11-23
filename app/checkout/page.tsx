"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { resolveCheckoutCategory, resolveRechargeProductFamily, safeProductReturnTo } from "@/lib/products/checkout-navigation";
import { findCheckoutSkuOption, mergeCheckoutSkuOptions } from "@/lib/products/checkout-sku-options.mjs";
import { resolveProductImageSrc } from "@/components/products/product-ui";
import ChatGptRechargeMethodComparison from "@/components/products/ChatGptRechargeMethodComparison";
import AirMobileProductDetails from "@/components/products/details/AirMobileProductDetails";
import EncMobileProductDetails from "@/components/products/details/EncMobileProductDetails";
import EuropeanSimProductDetails from "@/components/products/details/EuropeanSimProductDetails";
import OrangeSimProductDetails from "@/components/products/details/OrangeSimProductDetails";
import VodafoneSimProductDetails from "@/components/products/details/VodafoneSimProductDetails";
import MovistarSimProductDetails from "@/components/products/details/MovistarSimProductDetails";
import GiffgaffSimProductDetails from "@/components/products/details/GiffgaffSimProductDetails";
import HahaSimProductDetails from "@/components/products/details/HahaSimProductDetails";
import Lucky2ProductDetails from "@/components/products/details/Lucky2ProductDetails";
import OneNzProductDetails from "@/components/products/details/OneNzProductDetails";
import RakutenMobileProductDetails from "@/components/products/details/RakutenMobileProductDetails";
import UltraMobileProductDetails from "@/components/products/details/UltraMobileProductDetails";
import TMobileProductDetails from "@/components/products/details/TMobileProductDetails";
import Link from "next/link";
import {
  CreditCard,
  Gift,
  HelpCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  MessageCircle,
  Minus,
  Bot,
  ChevronDown,
  Plus,
  RefreshCcw,
  ShieldAlert,
  Truck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import PublicLayout from "@/components/layout/PublicLayout";
import { useMobileStorefront } from "@/hooks/use-mobile-storefront";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  computeProductSalesCount,
  getErrorText,
  getPublicProductDetail,
  type PublicProductRow,
  type PublicProductSkuRow,
} from "@/lib/supabase/public-catalog";
import {
  DEFAULT_PAYMENT_METHOD,
  getPaymentMethodOption,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import type { PaymentChannel, PaymentSubmitForm } from "@/lib/payments/channel-types";
import { submitPaymentForm } from "@/lib/payments/submit-payment-form.mjs";
import { openPublicSupport } from "@/lib/support/open-public-support";
import ExternalCashierFeeSummary from "@/components/payments/ExternalCashierFeeSummary";
import { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ACCOUNT_BALANCE_UPDATED_EVENT } from "@/lib/account/balance-events";
import { peekPublicProductPreview } from "@/lib/catalog/public-product-preview";
import { loadPublicRechargeChannels, peekPublicRechargeChannels } from "@/lib/catalog/public-recharge-channels";
import { refreshPublicCategories } from "@/lib/catalog/public-category-snapshot";
import {
  classifyCheckoutOrderResponse,
  classifyRetainedCheckoutOrder,
  createCheckoutSubmissionGuard,
  evaluateCheckoutBalance,
  formatCnyFromCents,
  getBalanceSubmissionBlockReason,
  parseAccountAssetsBalance,
  parseRetainedCheckoutOrder,
} from "@/lib/checkout/balance-flow.mjs";

const PRICE_LABELS: Record<string, string> = {
  "gift-apple-us": "¥14.84-¥742.00",
  "gift-giffgaff-topup": "¥107.80-¥215.60",
};

type SkuOption = {
  id: string;
  code?: string | null;
  label: string;
  rmb: number;
  stock?: number;
  status?: string;
  isDatabaseSku?: boolean;
  isCompatibilityPlaceholder?: boolean;
};

type LegalDocument = {
  id: string;
  document_type: string;
  version: string;
  title: string;
  content: string;
  content_hash: string;
};

type BalanceLoadStatus = "loading" | "ready" | "error";

type PendingBalanceOrder = {
  orderNo: string;
  requestId: string;
  customerEmail: string | null;
  skuId: string | null;
};

function createCheckoutClientRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const REQUIRED_AGREEMENT_TYPES = ["terms_of_service", "refund_policy", "digital_delivery_policy", "purchase_notice"];
const ORDER_ENABLED_PAYMENT_METHODS = new Set<PaymentMethodCode>(["balance", "usdt_bep20", "alipay", "wechat_pay"]);
const CHECKOUT_PAYMENT_OPTIONS = PAYMENT_METHOD_OPTIONS.filter((option) => option.code !== "binance_pay")
  .sort((a, b) => Number(a.code === "usdt_trc20") - Number(b.code === "usdt_trc20"));
const AGREEMENT_LABELS: Record<string, string> = {
  terms_of_service: "用户协议",
  refund_policy: "退款政策",
  digital_delivery_policy: "数字商品交付规则",
  purchase_notice: "商品购买须知",
};

const SKU_OPTIONS_BY_PRODUCT_ID: Record<string, SkuOption[]> = {
  "gift-apple-us": [2, 3, 4, 5, 10, 15, 20, 25, 50, 100].map((usd) => ({
    id: `${usd}-usd`,
    code: `${usd}-usd`,
    label: `${usd} USD`,
    rmb: usd * 7 * 1.06,
  })),
  "gift-giffgaff-topup": [
    { id: "10-gbp", code: "10-gbp", label: "10英镑", rmb: 14 * 7 * 1.1 },
    { id: "15-gbp", code: "15-gbp", label: "15英镑", rmb: 21 * 7 * 1.1 },
    { id: "20-gbp", code: "20-gbp", label: "20英镑", rmb: 28 * 7 * 1.1 },
  ],
};

const GPT_RECHARGE_PRODUCT_ID = "ai-gpt-cdk-tr-plus-1m";
const GROK_RECHARGE_PRODUCT_ID = "ai-grok-cdk-in-super-1m";
const GIFFGAFF_TOPUP_PRODUCT_ID = "gift-giffgaff-topup";

function isGiffgaffSimProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  const id = (product.id || "").toLowerCase();
  const isGiffgaff =
    name.includes("giffgaff") ||
    slug.includes("giffgaff") ||
    id === "3b973a67-20ad-4f91-a538-4f9a83b3d560" ||
    id === "5ed6a9c7-d9e2-4cb1-8161-fd5f8a4b192d" ||
    id === "8c4776d9-17e3-40af-a1e0-0101f55516dc" ||
    slug === "sim-001" ||
    slug === "sim-002" ||
    slug === "sim-003";
  const isTopup =
    id === GIFFGAFF_TOPUP_PRODUCT_ID ||
    id === "e00553bf-a2da-48c7-9bdc-9b897b18b2fd" ||
    id === "5e4025b0-9a14-4827-87a2-f7f3e0e79734" ||
    id === "b2878f67-344a-40e4-af59-b32b6db21d29" ||
    name.includes("充值") ||
    slug.includes("topup");
  return isGiffgaff && !isTopup;
}

function isHahaSimProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("haha") || slug.includes("haha");
}

function isTMobileProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return (
    (name.includes("t-mobile") || slug.includes("t-mobile") || slug.includes("tmobile")) &&
    !name.includes("ultra") &&
    !slug.includes("ultra")
  );
}

function isUltraMobileProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("ultra") || slug.includes("ultra");
}

function isLucky2Product(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("lucky") || slug.includes("lucky");
}

function isAirMobileProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("air mobile") || slug.includes("air-mobile");
}

function isEncMobileProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return (name.includes("enc") || slug.includes("enc")) && !name.includes("air") && !slug.includes("air");
}

function isOrangeSimProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("orange") || slug.includes("orange");
}

function isVodafoneSimProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("vodafone") || slug.includes("vodafone");
}

function isMovistarSimProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("movistar") || slug.includes("movistar");
}

function isEuropeanSimProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return (
    name.includes("orange") ||
    slug.includes("orange") ||
    name.includes("vodafone") ||
    slug.includes("vodafone") ||
    name.includes("movistar") ||
    slug.includes("movistar") ||
    name.includes("欧洲") ||
    slug.includes("european") ||
    slug.includes("eu-sim")
  );
}

function isRakutenMobileProduct(product: { id?: string; name?: string; slug?: string | null }) {
  const name = (product.name || "").toLowerCase();
  const slug = (product.slug || "").toLowerCase();
  return name.includes("rakuten") || slug.includes("rakuten") || name.includes("乐天");
}
const CLAUDE_RECHARGE_PRODUCT_IDS = [
  "ai-claude-cdk-ng-pro-1m",
  "ai-claude-cdk-ng-max-5x-1m",
  "ai-claude-cdk-ng-max-20x-1m",
];
const GEMINI_RECHARGE_PRODUCT_IDS = [
  "ai-gemini-google-one-pro-pixel",
  "ai-gemini-google-one-pro-pixel-1y",
];

function mapCheckoutProduct(row: PublicProductRow): Product {
  const stock = Number(row.stock ?? 0);
  const salesCount = computeProductSalesCount({
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: Number(row.price ?? 0),
  });

  return {
    id: row.slug || row.id,
    name: row.name,
    category: resolveCheckoutCategory(row),
    categoryLabel: "商品详情",
    description: row.short_description ?? row.description ?? "",
    price: Number(row.price ?? 0),
    image: row.image_url || undefined,
    imageUrl: row.image_url,
    originalPrice: row.original_price,
    stock,
    sortOrder: row.sort_order,
    metadata: { ...(row.metadata ?? {}), salesCount },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currency: "CNY",
    stockStatus: stock <= 0 ? "out-of-stock" : stock <= 10 ? "low-stock" : "in-stock",
    stockLabel: `库存：${stock}`,
    processingTime: row.delivery_type === "automatic" ? "自动发货" : "联系客服确认",
    deliveryMethod:
      row.delivery_type === "shipping"
        ? "physical"
        : row.delivery_type === "manual"
          ? "hybrid"
          : "digital",
    deliveryLabel:
      row.delivery_type === "automatic"
        ? "自动发货"
        : row.delivery_type === "shipping"
          ? "物流发货"
          : "人工处理",
    productType: row.delivery_type === "shipping" ? "physical" : "digital",
    listingStatus: "active",
    detail: row.description ?? row.short_description ?? "",
  };
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">结算页面加载中...</div>}>
      <CheckoutPageContent />
    </Suspense>
  );
}

function CheckoutPageContent() {
  const { isMobile } = useMobileStorefront();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { settings } = usePublicSettings();
  const productId = searchParams.get("p") || searchParams.get("product") || "";
  const requestedSkuId = searchParams.get("sku") ?? "";

  const [email, setEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingRegion, setShippingRegion] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>(DEFAULT_PAYMENT_METHOD);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>(() => peekPublicRechargeChannels() ?? []);
  const [paymentDropdownOpen, setPaymentDropdownOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalError, setLegalError] = useState("");
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [productRow, setProductRow] = useState<PublicProductRow | null>(() => peekPublicProductPreview(productId));
  const [productSkus, setProductSkus] = useState<PublicProductSkuRow[]>([]);
  const [productLoading, setProductLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [balanceStatus, setBalanceStatus] = useState<BalanceLoadStatus>("loading");
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const [balanceRequiresLogin, setBalanceRequiresLogin] = useState(false);
  const [pendingBalanceOrder, setPendingBalanceOrder] = useState<PendingBalanceOrder | null>(null);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [amountLimitDialogOpen, setAmountLimitDialogOpen] = useState(false);
  const paymentDropdownRef = useRef<HTMLDivElement | null>(null);
  const clientRequestIdRef = useRef("");
  const balanceRequestVersionRef = useRef(0);
  const submissionGuardRef = useRef(createCheckoutSubmissionGuard());

  const checkoutSessionKey = useMemo(
    () => `jianlian:checkout-balance:${productId || "unknown"}`,
    [productId]
  );

  const loadAccountBalance = useCallback(async () => {
    const requestVersion = balanceRequestVersionRef.current + 1;
    balanceRequestVersionRef.current = requestVersion;
    setBalanceStatus("loading");
    setBalanceError("");
    setBalanceRequiresLogin(false);

    try {
      const response = await fetch("/api/account/assets", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as unknown;
      if (requestVersion !== balanceRequestVersionRef.current) return;
      if (!response.ok) {
        setAvailableBalance(null);
        setBalanceStatus("error");
        setBalanceRequiresLogin(response.status === 401);
        setBalanceError(response.status === 401 ? "请先登录后查看账户余额" : "账户余额读取失败，请重新加载");
        return;
      }

      const parsed = parseAccountAssetsBalance(payload);
      if (parsed.kind !== "ready") {
        setAvailableBalance(null);
        setBalanceStatus("error");
        setBalanceError("账户余额暂时无法确认，请重新加载");
        return;
      }
      setAvailableBalance(parsed.balance);
      setBalanceStatus("ready");
    } catch {
      if (requestVersion !== balanceRequestVersionRef.current) return;
      setAvailableBalance(null);
      setBalanceStatus("error");
      setBalanceRequiresLogin(false);
      setBalanceError("账户余额读取失败，请重新加载");
    }
  }, []);

  useEffect(() => {
    if (!paymentDropdownOpen) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (target instanceof Node && !paymentDropdownRef.current?.contains(target)) {
        setPaymentDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPaymentDropdownOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [paymentDropdownOpen]);

  useEffect(() => {
    let active = true;
    clientRequestIdRef.current = createCheckoutClientRequestId();
    setPendingBalanceOrder(null);
    try {
      const raw = window.sessionStorage.getItem(checkoutSessionKey);
      const stored = raw ? parseRetainedCheckoutOrder(JSON.parse(raw)) : null;
      if (!stored) return;
      clientRequestIdRef.current = stored.requestId;
      setPendingBalanceOrder(stored);
      if (stored.skuId) setSelectedSkuId(stored.skuId);
      if (stored.customerEmail) setEmail(stored.customerEmail);
      setPaymentMethod("balance");

      void (async () => {
        try {
          const response = await fetch(`/api/orders/${encodeURIComponent(stored.orderNo)}`, { cache: "no-store" });
          const payload = await response.json().catch(() => null) as unknown;
          if (!active || !response.ok) return;
          const retained = classifyRetainedCheckoutOrder(payload, stored.orderNo);
          if (retained.kind === "terminal") {
            window.sessionStorage.removeItem(checkoutSessionKey);
            setPendingBalanceOrder(null);
            clientRequestIdRef.current = createCheckoutClientRequestId();
            return;
          }
          if (retained.kind !== "payable") return;
          const restoredOrder = { ...stored, customerEmail: retained.customerEmail ?? stored.customerEmail };
          if (restoredOrder.customerEmail) setEmail(restoredOrder.customerEmail);
          setPendingBalanceOrder(restoredOrder);
          window.sessionStorage.setItem(checkoutSessionKey, JSON.stringify(restoredOrder));
        } catch {
          // Keep the retained order locked to its original request identity. A failed
          // read must not create a replacement order or overwrite its contact data.
        }
      })();
    } catch {
      window.sessionStorage.removeItem(checkoutSessionKey);
    }

    return () => {
      active = false;
    };
  }, [checkoutSessionKey]);

  useEffect(() => {
    void loadAccountBalance();
    const refreshBalance = () => void loadAccountBalance();
    window.addEventListener("focus", refreshBalance);
    window.addEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, refreshBalance);
    return () => {
      window.removeEventListener("focus", refreshBalance);
      window.removeEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, refreshBalance);
      balanceRequestVersionRef.current += 1;
    };
  }, [loadAccountBalance]);

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      const cachedPreview = peekPublicProductPreview(productId);
      if (!cachedPreview) {
        setProductLoading(true);
      }
      setError("");
      if (cachedPreview) {
        setProductRow(cachedPreview);
      }
      setProductSkus([]);

      try {
        if (!productId.trim()) {
          setProductRow(null);
          setProductSkus([]);
          setError("缺少商品参数，请返回商品列表重新选择。");
          return;
        }

        const categoriesRead = refreshPublicCategories().catch(() => []);
        const detail = await getPublicProductDetail(productId);
        if (!active) return;
        setProductRow(detail?.product ?? null);
        setProductSkus(detail?.skus ?? []);
        setSelectedSkuId((current) => requestedSkuId || current);
        // Breadcrumb enrichment cannot hold the validated product/form hostage.
        void categoriesRead.then((categories) => {
          if (!active || !detail?.product.category_id) return;
          const path: string[] = [];
          const visited = new Set<string>();
          let category = categories.find((item) => item.id === detail.product.category_id);
          while (category && !visited.has(category.id)) {
            visited.add(category.id);
            path.unshift(category.slug);
            category = categories.find((item) => item.id === category?.parent_id);
          }
          if (path.length) {
            setProductRow((current) => {
              if (!current || current.id !== detail.product.id) return current;
              if (current.metadata?.category_slug === path[0] && current.metadata?.category_path === path.join("/")) {
                return current;
              }
              return { ...current, metadata: { ...current.metadata, category_slug: path[0], category_path: path.join("/") } };
            });
          }
        });
      } catch (loadError) {
        if (!active) return;
        setError(getErrorText(loadError, "商品读取失败，请返回商品列表重试"));
        setProductRow(null);
        setProductSkus([]);
      } finally {
        if (active) setProductLoading(false);
      }
    }

    loadProduct();

    return () => {
      active = false;
    };
  }, [productId, requestedSkuId]);

  useEffect(() => {
    let active = true;
    async function loadLegalDocuments() {
      setLegalLoading(true);
      setLegalError("");
      try {
        const response = await fetch("/api/legal/current", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as { documents?: LegalDocument[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "协议读取失败，请稍后重试");
        if (!active) return;
        setLegalDocuments(Array.isArray(payload?.documents) ? payload!.documents! : []);
      } catch (loadError) {
        if (!active) return;
        setLegalError(getErrorText(loadError, "协议读取失败，请稍后重试"));
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
    let active = true;
    const load = () => void loadPublicRechargeChannels()
      .then((channels) => { if (active) setPaymentChannels(channels); })
      .catch(() => { if (active) setPaymentChannels([]); });
    const revalidate = () => { if (document.visibilityState === "visible") load(); };
    load();
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      active = false;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, []);

  const product = useMemo(
    () => (productRow && (productRow.id === productId || productRow.slug === productId) ? mapCheckoutProduct(productRow) : null),
    [productRow, productId]
  );

  const databaseSkuOptions: SkuOption[] = productSkus.map((sku) => ({
    id: sku.id,
    code: sku.sku_code,
    label: sku.sku_title || sku.sku_code || sku.id,
    rmb: Number(sku.price ?? productRow?.price ?? 0),
    stock: Number(sku.stock ?? 0),
    status: sku.status,
    isDatabaseSku: true,
  }));
  const skuOptions = product
    ? mergeCheckoutSkuOptions(
        databaseSkuOptions,
        SKU_OPTIONS_BY_PRODUCT_ID[product.id] ?? [],
        { productHasSkus: productRow?.has_skus === true },
      )
    : [];
  const selectedSku =
    findCheckoutSkuOption(skuOptions, selectedSkuId) ??
    skuOptions.find((sku) => sku.status === "active" && Number(sku.stock ?? 0) > 0) ??
    skuOptions[0];
  const hasSku = skuOptions.length > 0;
  const selectedDatabaseSkuId = selectedSku?.isDatabaseSku ? selectedSku.id : null;
  const effectiveStock = selectedSku?.isCompatibilityPlaceholder
    ? 0
    : selectedSku?.isDatabaseSku
      ? Number(selectedSku.stock ?? 0)
      : Number(product?.stock ?? 0);
  const requiredAgreementDocs = REQUIRED_AGREEMENT_TYPES.map((type) => legalDocuments.find((doc) => doc.document_type === type));
  const agreementsReady = requiredAgreementDocs.every(Boolean);
  const agreementPayload = requiredAgreementDocs.filter(Boolean).map((doc) => ({ document_type: doc!.document_type, document_version_id: doc!.id, content_hash: doc!.content_hash }));
  const selectedDatabaseSkuRow = selectedDatabaseSkuId
    ? productSkus.find((sku) => sku.id === selectedDatabaseSkuId) ?? null
    : productSkus[0] ?? null;
  const rawEffectiveDeliveryType = String(
    selectedDatabaseSkuRow?.delivery_type || productRow?.delivery_type || ""
  ).trim().toLowerCase();
  const isExplicitNonShippingDelivery = ["automatic", "manual", "card", "account", "digital"].includes(rawEffectiveDeliveryType);
  const isExplicitShippingDelivery = ["shipping", "physical"].includes(rawEffectiveDeliveryType);
  const isAutomaticDelivery = rawEffectiveDeliveryType === "automatic";
  const isSimProduct = Boolean(
    !isExplicitNonShippingDelivery &&
    (
      (product?.category && ["sim-cards", "sim", "phone-cards"].includes(String(product.category))) ||
      (product?.slug &&
        !product.slug.includes("virtual") &&
        !product.slug.includes("gift") &&
        !product.slug.includes("topup") &&
        (product.slug.includes("sim") || product.slug.includes("mobile") || product.slug.includes("giffgaff") || product.slug.includes("lucky2") || product.slug.includes("t-mobile") || product.slug.includes("one-nz") || product.slug.includes("haha") || product.slug.includes("european"))) ||
      (product?.name && (product.name.toLowerCase().includes("sim") || product.name.toLowerCase().includes("mobile")))
    )
  );
  const isShippingProduct = isExplicitShippingDelivery || (!isExplicitNonShippingDelivery && isSimProduct);
  const effectiveDeliveryLabel =
    rawEffectiveDeliveryType === "automatic"
      ? "自动发货"
      : isShippingProduct
        ? "物流发货"
        : "人工处理";
  const displayProduct = useMemo(
    () => (product ? { ...product, deliveryLabel: effectiveDeliveryLabel } : null),
    [product, effectiveDeliveryLabel]
  );
  const selectedPaymentChannel = paymentChannels.find((channel) =>
    getPaymentMethodOption(paymentMethod)?.channelCodes.includes(channel.code)) ?? null;
  const selectedPaymentUnavailable = !ORDER_ENABLED_PAYMENT_METHODS.has(paymentMethod)
    || (paymentMethod !== "balance" && selectedPaymentChannel?.enabled !== true);
  const isPurchasable = !productLoading && Boolean(product) && productRow?.status === "active" && (!hasSku || Boolean(selectedSku)) && (!selectedSku?.status || selectedSku.status === "active") && effectiveStock > 0;
  const unavailableMessage =
    productRow?.status === "sold_out" || effectiveStock <= 0
      ? "该商品已售罄"
      : productRow?.status && productRow.status !== "active"
        ? "该商品目前不可购买"
        : "";
  const unitPrice = product ? (hasSku ? selectedSku?.rmb ?? product.price : product.price) : 0;
  const orderAmount = unitPrice * quantity;
  const paymentMaximum = selectedPaymentChannel?.maximumAmount;
  const paymentOverLimit = selectedPaymentChannel?.currency === "CNY"
    && typeof paymentMaximum === "number"
    && Number.isFinite(paymentMaximum)
    && orderAmount > paymentMaximum;
  const priceLabel = product ? getPriceLabel(product, selectedSku) : "";
  const balanceSummary = useMemo(
    () => evaluateCheckoutBalance(orderAmount, availableBalance),
    [availableBalance, orderAmount]
  );
  const balanceSubmissionBlockReason = getBalanceSubmissionBlockReason({
    paymentMethod,
    balanceStatus,
    balanceSummary,
  });
  const orderConfigurationLocked = productLoading || submitLoading || Boolean(pendingBalanceOrder);
  const submitButtonLabel = submitLoading
    ? "正在提交订单..."
    : pendingBalanceOrder
      ? "继续支付原订单"
      : balanceSubmissionBlockReason === "BALANCE_INSUFFICIENT"
        ? "余额不足"
        : balanceSubmissionBlockReason
          ? "余额未确认"
          : !isPurchasable
            ? "不可购买"
            : "提交订单";
  const amountLabel = useMemo(() => {
    if (!product) return "";
    return `¥${orderAmount.toFixed(2)}`;
  }, [orderAmount, product]);
  const rechargeReturnTo = useMemo(() => {
    const params = new URLSearchParams();
    params.set("product", productId);
    const originalReturnTo = searchParams.get("returnTo");
    if (originalReturnTo) params.set("returnTo", originalReturnTo);
    if (selectedSku?.id) params.set("sku", selectedSku.id);
    return `/products/account-recharge?returnTo=${encodeURIComponent(`/checkout?${params.toString()}`)}`;
  }, [productId, searchParams, selectedSku?.id]);

  if (productLoading && !product) {
    return <CheckoutLoadingShell />;
  }

  if (!product || !productRow) {
    return (
      <PublicLayout mobileNavigationUntilLg contentClassName="max-w-none px-4 py-5 sm:px-5 lg:mt-0 lg:px-6">
        <Card>
          <CardContent className="py-20 text-center">
            <h2 className="text-lg font-semibold">商品未找到</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || "请返回商品页重新选择。"}
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  const handleSubmit = async () => {
    if (productLoading) return;
    if (!productRow || submitLoading || submissionGuardRef.current.isActive()) return;

    if (hasSku && !selectedSku) {
      toast.warning("请选择 SKU");
      return;
    }

    if (!isPurchasable) {
      toast.error(unavailableMessage || "该商品目前不可购买");
      return;
    }

    if (legalLoading || legalError || !agreementsReady) {
      toast.error(legalError || "协议版本未准备好，请刷新后重试");
      return;
    }

    if (!confirmed) {
      toast.warning("请先阅读并确认订单协议");
      return;
    }

    if (selectedPaymentUnavailable) {
      toast.warning("该支付方式暂未开放，请选择余额支付。");
      return;
    }

    if (paymentOverLimit) {
      setAmountLimitDialogOpen(true);
      return;
    }

    if (balanceSubmissionBlockReason) {
      if (balanceSubmissionBlockReason === "BALANCE_INSUFFICIENT" && balanceSummary.kind === "ready") {
        setBalanceDialogOpen(true);
      } else if (balanceSubmissionBlockReason === "BALANCE_LOADING") {
        toast.info("正在读取账户余额，请稍候");
      } else {
        toast.error(balanceError || "账户余额暂时无法确认，请重新加载");
      }
      return;
    }

    if (!email.trim()) {
      toast.warning("请填写联系邮箱");
      return;
    }

    if (isShippingProduct && (!customerName.trim() || !customerPhone.trim() || !shippingRegion.trim() || !shippingAddress.trim())) {
      toast.warning("请完整填写收件人、联系电话、省市区和详细地址");
      return;
    }

    if (isShippingProduct && !isValidContactPhone(customerPhone)) {
      toast.warning("请输入有效的联系电话");
      return;
    }

    if (!submissionGuardRef.current.tryStart()) return;
    setSubmitLoading(true);

    try {
      if (!clientRequestIdRef.current) {
        clientRequestIdRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      window.sessionStorage.setItem(
        checkoutSessionKey,
        JSON.stringify({
          requestId: clientRequestIdRef.current,
          orderNo: pendingBalanceOrder?.orderNo ?? null,
          customerEmail: (pendingBalanceOrder?.customerEmail ?? email.trim()) || null,
          skuId: pendingBalanceOrder?.skuId ?? selectedDatabaseSkuId,
        })
      );

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: productRow.id,
          quantity,
          sku_id: selectedDatabaseSkuId,
          payment_method: paymentMethod,
          client_request_id: clientRequestIdRef.current,
          customer_email: email,
          customer_name: customerName,
          ...(isShippingProduct ? { customer_phone: customerPhone.trim() } : {}),
          shipping_address: isShippingProduct
            ? {
                region: shippingRegion,
                address: shippingAddress,
              }
            : null,
          agreement_version_ids: agreementPayload,
          agreements: agreementPayload,
          customer_note: [
            hasSku ? `SKU：${selectedSku.label}` : "",
            isShippingProduct
              ? `收货地址：${shippingRegion.trim() === shippingAddress.trim() ? shippingAddress.trim() : `${shippingRegion.trim()} ${shippingAddress.trim()}`.trim()}`
              : "",
            customerNote,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            order?: { order_no?: string };
            order_no?: string | null;
            error?: string;
            code?: string;
            request_id?: string;
            warning_code?: string;
            paymentSession?: { paymentType?: string; paymentUrl?: string; submitForm?: PaymentSubmitForm };
          }
        | null;

      const orderNo = result?.order?.order_no ?? result?.order_no ?? null;
      const responseClassification = classifyCheckoutOrderResponse(response.status, result);

      if (!response.ok) {
        const message = result?.error ?? "订单创建失败，请稍后重试";
        if (response.status === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/checkout?product=${productId}`)}`);
          return;
        }
        if (responseClassification.kind === "balance_insufficient_existing_order") {
          const requestId = responseClassification.requestId ?? clientRequestIdRef.current;
          const existingOrder = {
            orderNo: responseClassification.orderNo,
            requestId,
            customerEmail: email.trim() || null,
            skuId: selectedDatabaseSkuId,
          };
          clientRequestIdRef.current = requestId;
          setPendingBalanceOrder(existingOrder);
          setPaymentDropdownOpen(false);
          setPaymentMethod("balance");
          window.sessionStorage.setItem(checkoutSessionKey, JSON.stringify(existingOrder));
          setBalanceDialogOpen(true);
          void loadAccountBalance();
          return;
        }
        if (responseClassification.kind === "existing_order_payment_error" && paymentMethod === "balance") {
          const requestId = responseClassification.requestId ?? clientRequestIdRef.current;
          const existingOrder = {
            orderNo: responseClassification.orderNo,
            requestId,
            customerEmail: email.trim() || null,
            skuId: selectedDatabaseSkuId,
          };
          clientRequestIdRef.current = requestId;
          setPendingBalanceOrder(existingOrder);
          setPaymentDropdownOpen(false);
          setPaymentMethod("balance");
          window.sessionStorage.setItem(checkoutSessionKey, JSON.stringify(existingOrder));
          toast.error(message);
          return;
        }
        // Once the API confirms an order number, the idempotent order exists.
        // Continue with that order instead of inviting a second submission.
        if (orderNo) {
          router.push(`/payment?order=${encodeURIComponent(orderNo)}`);
          return;
        }
        throw new Error(message);
      }

      if (!orderNo) throw new Error("订单创建失败，请稍后重试");

      window.sessionStorage.removeItem(checkoutSessionKey);
      if (result?.paymentSession?.submitForm
        && submitPaymentForm(result.paymentSession.submitForm)) return;
      if (
        result?.paymentSession?.paymentType === "redirect"
        && result.paymentSession.paymentUrl
      ) {
        window.location.assign(result.paymentSession.paymentUrl);
        return;
      }
      router.push(`/payment?order=${encodeURIComponent(orderNo)}`);
    } catch (submitError) {
      toast.error(getErrorText(submitError, "订单创建失败，请稍后重试"));
    } finally {
      submissionGuardRef.current.finish();
      setSubmitLoading(false);
    }
  };

  return (
    <PublicLayout mobileNavigationUntilLg contentClassName={cn("max-w-none py-3 lg:mt-0 lg:h-[calc(100dvh-62px)] lg:overflow-hidden lg:py-4 [--checkout-purchase-width:clamp(327px,calc(24vw-13px),359px)]", isMobile && "!h-auto !overflow-visible")}>
      <div data-testid="checkout-layout" className={cn("grid min-h-0 grid-cols-1 gap-3.5 lg:h-full lg:gap-4 lg:grid-cols-[minmax(0,1fr)_var(--checkout-purchase-width)]", isMobile && "!grid-cols-1 !h-auto")}>
        <ProductDetailCard
          product={displayProduct}
          loading={productLoading}
          priceLabel={priceLabel}
          closeHref={
            safeProductReturnTo(searchParams.get("returnTo")) ??
            (typeof window !== "undefined" ? safeProductReturnTo(sessionStorage.getItem("checkout_return_to")) : null) ??
            getProductListHref(product)
          }
        />

        <Card id="checkout-purchase-card" data-testid="checkout-purchase-panel" className="scroll-mt-32 h-auto min-h-0 overflow-hidden lg:h-full">
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="min-h-0 flex-1 bg-white p-4 lg:overflow-y-auto">
              <div className="flex min-h-full flex-col gap-4">
              {hasSku ? (
                <SkuSelector
                  options={skuOptions}
                  selectedSkuId={selectedSku.id}
                  onSelectSku={setSelectedSkuId}
                  disabled={orderConfigurationLocked}
                />
              ) : null}

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    <span className="text-red-500">*</span>联系邮箱
                    {isShippingProduct && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        （用于接收订单及物流发货单号）
                      </span>
                    )}
                  </label>
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={
                      isShippingProduct
                        ? "请输入接收物流通知的邮箱"
                        : "请输入接收卡密的邮箱"
                    }
                    className="h-10 bg-slate-50 text-sm"
                    disabled={orderConfigurationLocked}
                  />
                </div>

                <div>
                  <label htmlFor="checkout-coupon" className="mb-1.5 block text-sm font-medium">优惠券</label>
                  <Input id="checkout-coupon" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} maxLength={40} autoComplete="off" placeholder="请输入优惠券" className="h-10 bg-slate-50 text-sm" />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    提交信息或备注
                  </label>
                  <Input
                    value={customerNote}
                    onChange={(event) => setCustomerNote(event.target.value)}
                    placeholder={settings.default_order_note_hint}
                    className="h-10 bg-slate-50 text-sm"
                  />
                </div>

              {isShippingProduct ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium">
                      <span className="text-red-500">*</span>收件人姓名
                    </label>
                    <Input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="请输入收件人姓名"
                      className="h-10 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium">
                      <span className="text-red-500">*</span>联系电话
                    </label>
                    <Input
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="请输入收件人联系电话"
                      inputMode="tel"
                      autoComplete="tel"
                      className="h-10 bg-slate-50 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium">
                      <span className="text-red-500">*</span>详细地址
                    </label>
                    <Input
                      value={shippingAddress}
                      onChange={(event) => {
                        const nextAddress = event.target.value;
                        setShippingAddress(nextAddress);
                        setShippingRegion(nextAddress);
                      }}
                      placeholder="请输入省市区街道门牌等详细收货地址"
                      className="h-10 w-full bg-slate-50 text-sm"
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-auto border-t border-border pt-4">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  支付方式
                </div>
                <PaymentMethodSelect
                  open={paymentDropdownOpen}
                  selected={paymentMethod}
                  rootRef={paymentDropdownRef}
                  onOpenChange={setPaymentDropdownOpen}
                  onSelect={setPaymentMethod}
                  channels={paymentChannels}
                  disabled={orderConfigurationLocked}
                />
                {selectedPaymentUnavailable ? (
                  <p className="mt-2 text-xs text-amber-700">
                    该支付方式暂未开放，不会生成二维码、钱包地址或假支付结果。
                  </p>
                ) : null}
                {selectedPaymentChannel?.providerExternalFeeDisclosure ? (
                  <div className="sr-only" aria-hidden="true">
                    {selectedPaymentChannel.providerExternalFeeDisclosure}
                    <ExternalCashierFeeSummary principal={orderAmount} provider={selectedPaymentChannel.provider} currency={selectedPaymentChannel.currency} />
                  </div>
                ) : null}
                {paymentMethod === "balance" && balanceStatus === "error" ? (
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-red-700">
                    <span>{balanceError}</span>
                    <button type="button" className="shrink-0 font-medium underline" onClick={() => balanceRequiresLogin ? router.push(`/login?redirect=${encodeURIComponent(`/checkout?product=${productId}`)}`) : void loadAccountBalance()}>
                      {balanceRequiresLogin ? "去登录" : "重新加载"}
                    </button>
                  </div>
                ) : null}
              </div>

              <div id="checkout-submit-feedback" aria-live="polite">
                {pendingBalanceOrder ? (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    原订单 {pendingBalanceOrder.orderNo} 已保留；余额充足后将继续处理该订单，不会创建第二个订单。
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border pt-4">
                <div data-testid="checkout-submit-controls" className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2">
                  <div className="flex h-10 items-center rounded-lg border border-border bg-white">
                    <button
                      type="button"
                      className="flex h-10 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      disabled={orderConfigurationLocked}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-8 text-center text-sm font-semibold">
                      {quantity}
                    </div>
                    <button
                      type="button"
                      className="flex h-10 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setQuantity((value) =>
                          Math.min(Math.max(effectiveStock, 1), value + 1)
                        )
                      }
                      disabled={orderConfigurationLocked || effectiveStock <= quantity}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    type="button"
                    className="h-11 min-w-0 rounded-full px-3 text-sm font-semibold"
                    onClick={handleSubmit}
                    disabled={productLoading || submitLoading || (Boolean(balanceSubmissionBlockReason) && balanceSubmissionBlockReason !== "BALANCE_INSUFFICIENT")}
                    aria-describedby="checkout-submit-feedback"
                  >
                    <span className="min-w-0 truncate">{submitButtonLabel}</span>
                    <span className="mx-2 h-4 w-px shrink-0 bg-white/50" />
                    <span className="shrink-0 text-base font-semibold tabular-nums">{amountLabel}</span>
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 items-start gap-2 border-t border-border pt-4 text-[11px] leading-5">
                <input
                  id="checkout-agreement-confirmation"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  aria-label="确认已阅读并同意当前订单协议"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <div className="min-w-0">
                  <span className="block">我已阅读并同意用户协议、退款政策、</span>
                  <span>交付规则与购买须知，确认订单无误。</span>{" "}
                  <button
                    type="button"
                    className="inline whitespace-nowrap font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                    onClick={() => setTermsOpen(true)}
                  >
                    查看协议
                  </button>
                </div>
              </div>
            </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} documents={legalDocuments} error={legalError} loading={legalLoading} />
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>账户余额不足</DialogTitle>
          </DialogHeader>
          {balanceSummary.kind === "ready" ? (
            <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/60 p-4 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">当前余额</span><strong>¥{formatCnyFromCents(balanceSummary.balanceCents)}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">本次支付</span><strong>¥{orderAmount.toFixed(2)}</strong></div>
              <div className="flex justify-between gap-4 border-t border-orange-100 pt-2 text-orange-700"><span>还需充值</span><strong>¥{formatCnyFromCents(balanceSummary.shortfallCents)}</strong></div>
            </div>
          ) : null}
          {pendingBalanceOrder ? <p className="text-xs leading-5 text-amber-800">订单 {pendingBalanceOrder.orderNo} 已保留，充值返回后将继续使用原订单。</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setBalanceDialogOpen(false)}>取消</Button>
            <Button type="button" onClick={() => router.push(rechargeReturnTo)}>去充值</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={amountLimitDialogOpen} onOpenChange={setAmountLimitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>支付宝/微信支付金额超限</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            支付宝/微信单笔支付金额大于2000元，请联系人工客服处理。
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAmountLimitDialogOpen(false)}>取消</Button>
            <Button type="button" variant="outline" onClick={() => { setAmountLimitDialogOpen(false); openPublicSupport(); }}>联系客服</Button>
            <Button type="button" variant="outline" onClick={() => { setPaymentMethod("balance"); setAmountLimitDialogOpen(false); }}>使用余额支付</Button>
            <Button type="button" onClick={() => router.push("/products/account-recharge")}>去充值</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}

function isValidContactPhone(value: string) {
  const normalized = value.trim();
  const digitCount = normalized.replace(/\D/g, "").length;
  return (
    normalized.length <= 30 &&
    digitCount >= 6 &&
    digitCount <= 20 &&
    /^\+?[0-9][0-9()\s-]*$/.test(normalized)
  );
}

function PaymentMethodSelect({
  open,
  rootRef,
  selected,
  onOpenChange,
  onSelect,
  channels,
  disabled,
}: {
  open: boolean;
  rootRef: RefObject<HTMLDivElement>;
  selected: PaymentMethodCode;
  onOpenChange: (open: boolean) => void;
  onSelect: (method: PaymentMethodCode) => void;
  channels: PaymentChannel[];
  disabled?: boolean;
}) {
  const selectedOption = getPaymentMethodOption(selected) ?? CHECKOUT_PAYMENT_OPTIONS[0];
  const available = (index: number) => {
    const option = CHECKOUT_PAYMENT_OPTIONS[index];
    return Boolean(option && ORDER_ENABLED_PAYMENT_METHODS.has(option.code)
      && (option.code === "balance" || channels.some((channel) => option.channelCodes.includes(channel.code) && channel.enabled)));
  };
  const descriptionFor = (option: typeof selectedOption) => {
    const channel = channels.find((item) => option.channelCodes.includes(item.code));
    return channel?.maximumAmount && channel.currency === "CNY"
      ? `${option.label}，单笔最高 ¥${channel.maximumAmount}`
      : option.description;
  };
  const selectedIndex = Math.max(0, CHECKOUT_PAYMENT_OPTIONS.findIndex((option) => option.code === selected));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function moveActive(step: number) {
    setActiveIndex((current) => {
      const count = CHECKOUT_PAYMENT_OPTIONS.length;
      for (let offset = 1; offset <= count; offset++) {
        const next = (current + step * offset + count * 2) % count;
        if (available(next)) return next;
      }
      return current;
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        onOpenChange(false);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        moveActive(step);
        onOpenChange(true);
      } else {
        moveActive(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = CHECKOUT_PAYMENT_OPTIONS[activeIndex];
      if (option && available(activeIndex)) onSelect(option.code);
      onOpenChange(false);
    }
  }

  return (
    <div ref={rootRef} className="relative z-30" onKeyDown={handleKeyDown}>
      <button
        type="button"
        role="combobox"
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-[#ead9cc] bg-[#fffaf6] px-3 py-2 text-left text-sm transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="checkout-payment-method-options"
        aria-activedescendant={open ? `checkout-payment-method-${CHECKOUT_PAYMENT_OPTIONS[activeIndex]?.code ?? selected}` : undefined}
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-2">
          <PaymentMethodIcon method={selectedOption.code} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{selectedOption.label}</span>
            <span className="block truncate text-xs text-muted-foreground">{descriptionFor(selectedOption)}</span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open ? "rotate-180" : "")} />
      </button>

      {open ? (
        <div
          id="checkout-payment-method-options"
          className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 max-h-[232px] overflow-y-auto rounded-xl border border-[#ead9cc] bg-white p-1 shadow-xl"
          role="listbox"
        >
          {CHECKOUT_PAYMENT_OPTIONS.map((option, index) => {
            const active = option.code === selected;
            const keyboardActive = index === activeIndex;
            const unavailable = !available(index);
            return (
              <button
                key={option.code}
                id={`checkout-payment-method-${option.code}`}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="option"
                aria-selected={active}
                aria-disabled={unavailable}
                disabled={unavailable}
                tabIndex={-1}
                className={cn(
                  "flex h-14 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                  active ? "bg-primary/10 text-primary" : "text-slate-800 hover:bg-slate-50",
                  keyboardActive && !active ? "bg-slate-50 ring-1 ring-primary/20" : "",
                  unavailable ? "cursor-not-allowed opacity-50" : ""
                )}
                onMouseEnter={() => { if (!unavailable) setActiveIndex(index); }}
                onClick={() => {
                  if (unavailable) return;
                  onSelect(option.code);
                  onOpenChange(false);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PaymentMethodIcon method={option.code} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{option.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{descriptionFor(option)}</span>
                  </span>
                </span>
                {unavailable ? (
                  <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    暂未开放
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                    可用
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PaymentMethodIcon({ method }: { method: PaymentMethodCode }) {
  const className = "h-4 w-4 shrink-0 text-primary";
  if (method === "balance") return <Wallet className={className} />;
  if (method === "wechat_pay") return <Smartphone className={className} />;
  if (method === "binance_pay") return <Sparkles className={className} />;
  if (method === "usdt_trc20" || method === "usdt_bep20") return <Bot className={className} />;
  return <CreditCard className={className} />;
}

function TermsDialog({
  open,
  onOpenChange,
  documents,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: LegalDocument[];
  loading: boolean;
  error: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-slate-50 px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-base">⚠️</span>
            当前下单协议版本
          </DialogTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            请在下单前阅读当前生效的协议版本。订单创建后会保存本次确认的协议版本和内容摘要。
          </p>
        </DialogHeader>

        <div className="max-h-[calc(86vh-120px)] space-y-5 overflow-y-auto px-6 py-5 text-sm leading-7">
          {loading ? <div className="rounded-xl border bg-slate-50 p-4 text-muted-foreground">正在读取当前协议版本...</div> : null}
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : null}
          {!loading && !error && documents.length ? documents.map((doc) => (
            <section key={doc.id} className="rounded-xl border border-border bg-white p-4">
              <h3 className="mb-1 font-semibold text-foreground">{AGREEMENT_LABELS[doc.document_type] ?? doc.title} v{doc.version}</h3>
              <div className="mb-2 font-mono text-xs text-muted-foreground">Hash: {doc.content_hash.slice(0, 16)}...</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{doc.content}</p>
            </section>
          )) : null}
          {!loading && !error && !documents.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">当前没有可用协议版本，请联系管理员。</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function ProductDetailSkeleton() {
  return <div data-testid="checkout-detail-skeleton" role="status" aria-label="商品详情加载中" className="mt-8 flex min-h-[240px] flex-1 flex-col justify-evenly gap-5 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/60 to-white p-6">
    <div className="h-6 w-36 animate-pulse rounded-lg bg-orange-100/65 motion-reduce:animate-none" />
    {["w-full", "w-5/6", "w-full", "w-2/3"].map((width, index) => <div key={index} className={cn(width, "h-4 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none")} />)}
  </div>;
}

function CheckoutLoadingShell() {
  return <PublicLayout mobileNavigationUntilLg contentClassName="max-w-none py-3 lg:mt-0 lg:h-[calc(100dvh-62px)] lg:overflow-hidden lg:py-4 [--checkout-purchase-width:clamp(327px,calc(24vw-13px),359px)]">
    <div data-testid="checkout-progressive-loading" className="grid min-h-0 grid-cols-1 gap-3.5 lg:h-full lg:gap-4 lg:grid-cols-[minmax(0,1fr)_var(--checkout-purchase-width)]">
      <Card className="min-h-0 overflow-auto"><CardContent className="p-4 sm:p-6"><div className="h-7 w-40 animate-pulse rounded-lg bg-orange-100/60 motion-reduce:animate-none" /><ProductDetailSkeleton /></CardContent></Card>
      <Card className="min-h-0"><CardContent className="space-y-5 p-4"><h2 className="text-base font-semibold">订单信息</h2>{["联系邮箱", "提交信息或备注", "支付方式"].map(label => <div key={label}><p className="mb-2 text-sm text-muted-foreground">{label}</p><div className="h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" /></div>)}<p className="text-xs text-muted-foreground">商品信息就绪后可继续填写。</p></CardContent></Card>
    </div>
  </PublicLayout>;
}

function ProductDetailCard({
  product,
  loading = false,
  priceLabel,
  closeHref,
}: {
  product: Product;
  loading?: boolean;
  priceLabel: string;
  closeHref: string;
}) {
  const router = useRouter();
  const { isMobile } = useMobileStorefront();
  const family = resolveRechargeProductFamily(product);
  return (
    <Card data-testid="checkout-product-detail" className="relative h-auto min-h-0 overflow-hidden lg:h-full">
      <button
        type="button"
        data-route-loading="true"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground active:scale-95 sm:right-4 sm:top-4 sm:h-9 sm:w-9"
        onClick={() => {
          // 点击一次立即退出返回分类列表页面，触发顶部横条加载动画
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("jianlian:start-top-loading"));
          }
          router.push(closeHref);
        }}
        aria-label="关闭下单页面"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className={cn("h-auto p-4 sm:p-6 lg:h-full lg:overflow-y-auto lg:[scrollbar-gutter:stable_both-edges]", isMobile && "!h-auto !overflow-visible !p-3.5", loading && "flex flex-col")}>
        <div data-testid="checkout-product-detail-content" className={cn("mx-auto w-full max-w-[1040px]", loading && "flex min-h-0 flex-1 flex-col")}>
        <div className="mb-3 pr-9 shrink-0 text-xs font-medium text-muted-foreground sm:mb-5 sm:text-sm">
          {product.categoryLabel}
        </div>

        <div className={cn("grid shrink-0 gap-4 sm:gap-6 lg:grid-cols-[240px_minmax(0,1fr)]", isMobile && "!grid-cols-1 !gap-3.5")}>
          <div className="flex min-h-[140px] items-center justify-center rounded-xl bg-slate-50 py-3 sm:min-h-[210px] sm:py-0">
            <ProductArtwork product={product} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">{product.name}</h1>
            <p className="mt-2 w-full text-sm leading-relaxed text-muted-foreground sm:mt-3">
              {product.description}
            </p>

            <div className="mt-4 grid w-full grid-cols-2 gap-3 rounded-xl border border-border bg-white p-3.5 sm:mt-8 sm:gap-4 sm:p-5">
              <DetailMetric
                label="商品分类"
                value={`销量 ${computeProductSalesCount({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  explicitSales: Number(product.metadata?.salesCount ?? 0),
                })}`}
              />
              <DetailMetric label="商品单价" value={priceLabel} highlight />
              <DetailMetric
                label="商品库存"
                value={product.stockLabel}
                success={product.stockStatus === "in-stock"}
                danger={product.stockStatus === "out-of-stock"}
              />
              <DetailMetric label="商品发货方式" value={product.deliveryLabel} />
            </div>

            <div className={cn("mt-3.5 lg:hidden", isMobile && "!block")}>
              <button
                type="button"
                onClick={() => document.getElementById("checkout-purchase-card")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-orange-50/80 px-4 text-sm font-semibold text-primary shadow-sm transition-colors active:bg-orange-100"
              >
                <span>选择规格 / 填写订单</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {loading && !product.description && !product.detail ? (
          <ProductDetailSkeleton />
        ) : family === "chatgpt" ? (
          product.name.includes("成品") || product.id === "946a345e-c0a1-4a6b-a172-f994c6af2194" ? (
            <GptPremadeAccountDetails product={product} />
          ) : (
            <GptRechargeDetails product={product} />
          )
        ) : family === "grok" ? (
          <GrokRechargeDetails product={product} />
        ) : family === "claude" ? (
          <ClaudeRechargeDetails product={product} />
        ) : family === "gemini" ? (
          <GeminiRechargeDetails product={product} />
        ) : product.id === GIFFGAFF_TOPUP_PRODUCT_ID || (product.name.toLowerCase().includes("giffgaff") && (product.name.includes("充值") || (product.slug || "").includes("topup"))) ? (
          <GiffgaffTopupDetails product={product} />
        ) : product.id.startsWith("gift-apple-") ? (
          <AppleGiftCardDetails product={product} />
        ) : product.id.startsWith("dig-apple-id-") ? (
          <AppleIdDetails product={product} />
        ) : product.id === "sim-nz-001" || product.name.toLowerCase().includes("one nz") ? (
          <OneNzProductDetails product={product} />
        ) : isGiffgaffSimProduct(product) ? (
          <GiffgaffSimProductDetails product={product} />
        ) : isHahaSimProduct(product) ? (
          <HahaSimProductDetails product={product} />
        ) : isLucky2Product(product) ? (
          <Lucky2ProductDetails product={product} />
        ) : isTMobileProduct(product) ? (
          <TMobileProductDetails product={product} />
        ) : isUltraMobileProduct(product) ? (
          <UltraMobileProductDetails product={product} />
        ) : isAirMobileProduct(product) ? (
          <AirMobileProductDetails product={product} />
        ) : isEncMobileProduct(product) ? (
          <EncMobileProductDetails product={product} />
        ) : isOrangeSimProduct(product) ? (
          <OrangeSimProductDetails product={product} />
        ) : isVodafoneSimProduct(product) ? (
          <VodafoneSimProductDetails product={product} />
        ) : isMovistarSimProduct(product) ? (
          <MovistarSimProductDetails product={product} />
        ) : isEuropeanSimProduct(product) ? (
          <EuropeanSimProductDetails product={product} />
        ) : isRakutenMobileProduct(product) ? (
          <RakutenMobileProductDetails product={product} />
        ) : (
          <div className="mt-8 w-full">
            <h2 className="mb-3 text-base font-semibold">商品详情</h2>
            <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {product.detail || product.description}
            </p>
            <div className="mt-4 space-y-2 text-sm font-medium text-red-500">
              <p>请仔细阅读商品说明后再下单。</p>
              <p>卡密/账号/兑换类商品属于一次性商品，售出后不支持无理由退换。</p>
              <p>商品当前库存显示为 0 时，仅展示价格和套餐信息，暂不可购买。</p>
            </div>
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}

function AppleGiftCardDetails({ product }: { product: Product }) {
  const isTurkeyCard = product.id === "gift-apple-tr-500";
  const regionLabel = isTurkeyCard ? "土耳其区" : "美国区";
  const faceValue = isTurkeyCard ? "500 土耳其里拉" : "按下单选择的美元面额";

  const highlights = [
    {
      icon: Gift,
      title: "App Store 礼品卡",
      text: `适用于 Apple ${regionLabel} App Store、iTunes、Apple Music 等 Apple 数字内容消费。`,
    },
    {
      icon: KeyRound,
      title: "卡密交付",
      text: "下单后交付兑换码/卡密，收到后请第一时间核对并尽快完成兑换。",
    },
    {
      icon: Smartphone,
      title: "同区账号兑换",
      text: `需要使用 ${regionLabel} Apple ID 兑换，不同国家或地区账号通常无法跨区兑换。`,
    },
    {
      icon: CheckCircle2,
      title: "一次性商品",
      text: "兑换码属于一次性数字商品，发出后不支持无理由退换。",
    },
    {
      icon: ShieldCheck,
      title: "兑换前核对",
      text: "兑换前请确认账号地区、商品面额和使用场景，避免兑换到错误账号。",
    },
    {
      icon: Clock3,
      title: "24小时内检查",
      text: "收到卡密后请在售后期内完成核验，异常及时联系在线客服。",
    },
  ];

  const rules = [
    ["商品内容", `${product.name}，面额为 ${faceValue}。`],
    ["适用范围", `${regionLabel} Apple ID，可用于 App Store、iTunes、Apple Music、iCloud 等 Apple 服务余额充值。`],
    ["发货方式", "数字卡密/兑换码交付，请在订单页或客服交付信息中复制使用。"],
    ["兑换限制", `仅建议使用 ${regionLabel} Apple ID 兑换；账号地区不一致时，可能提示无法兑换。`],
    ["售后说明", "卡密类商品发出后不支持无理由退换。若无法兑换，请保留完整报错截图和卡密信息，在售后期内联系客服。"],
  ];

  const steps = [
    ["第一步：确认账号地区", `打开 Apple ID 账户信息，确认账号国家或地区为${regionLabel.replace("区", "")}。`],
    ["第二步：下单接收卡密", "选择商品并提交订单，等待系统或客服交付礼品卡兑换码。"],
    ["第三步：打开兑换入口", "进入 App Store，点击右上角头像，选择“兑换礼品卡或代码”。"],
    ["第四步：输入卡密兑换", "复制卡密并粘贴到兑换框，确认后余额会进入当前 Apple ID。"],
    ["第五步：检查余额", "兑换完成后请检查 Apple ID 余额或订阅服务状态，确认是否到账。"],
  ];

  const notices = [
    "兑换前请确认 Apple ID 地区与礼品卡地区一致，跨区兑换失败不属于商品质量问题。",
    "卡密一经发出，请勿泄露给他人；被他人兑换后无法追回。",
    "不要频繁切换 Apple ID 地区或在异常网络环境下反复兑换，避免触发账号风控。",
    "如果 App Store 提示代码无效、地区不匹配或已兑换，请截图保留完整提示并联系在线客服。",
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white">
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-600 to-amber-700 px-6 py-8 text-white">
          <div className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold">
            Apple Gift Card | {regionLabel}
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight">
            {product.name}
          </h2>
          <p className="mt-2 text-base font-semibold text-orange-50">
            数字卡密交付，同区 Apple ID 兑换使用
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-orange-50/90">
            本商品为 Apple {regionLabel} App Store & iTunes 礼品卡。下单前请确认自己的 Apple ID 地区、
            兑换用途和面额是否匹配；收到卡密后请第一时间兑换并检查余额。
          </p>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-center"
              >
                <Icon className="mx-auto h-7 w-7 text-orange-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-orange-700" />
          商品说明与兑换规则
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 text-sm leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-orange-700" />
          使用方法
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-rose-700">
          <Clock3 className="h-5 w-5" />
          售后与注意事项
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {notices.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function GiffgaffTopupDetails({ product }: { product: Product }) {
  const highlights = [
    {
      icon: CreditCard,
      title: "16位充值卡密",
      text: "下单后按商品面额交付 Giffgaff 充值卡密，发货方式为 16 位卡密。",
    },
    {
      icon: Gift,
      title: "支持多档面额",
      text: "支持 10 英镑、15 英镑、20 英镑等充值档位，具体以页面 SKU 选择为准。",
    },
    {
      icon: Smartphone,
      title: "自助充值",
      text: "收到卡密后进入 Giffgaff 官网或 App 的 Voucher / Top-up 页面自助兑换。",
    },
    {
      icon: CheckCircle2,
      title: "即时核验",
      text: "兑换完成后请第一时间检查号码余额或套餐状态，确认充值是否到账。",
    },
    {
      icon: Clock3,
      title: "售后时效",
      text: "卡密类商品请在发货后 24 小时内完成核验，有问题及时联系客服。",
    },
    {
      icon: ShieldCheck,
      title: "一次性商品",
      text: "卡密一经发出不支持无理由退换，使用前请确认充值号码和面额。",
    },
  ];

  const rules = [
    ["商品内容", `${product.name}，支持 Giffgaff 号码余额充值。`],
    ["发货方式", "16 位充值卡密，按下单选择的面额交付。"],
    [
      "充值方式",
      "进入 Giffgaff 官网或 App，选择 Top-up / Redeem a voucher，输入 16 位卡密完成充值。",
    ],
    [
      "使用前确认",
      "请确认 Giffgaff 手机号、充值面额和账号状态正常，避免卡密兑换到错误号码。",
    ],
    [
      "售后说明",
      "卡密类商品属于一次性数字商品，非商品问题售出后不支持无理由退换。",
    ],
  ];

  const steps = [
    ["第一步：选择面额", "在下单页选择需要的 10 英镑、15 英镑或 20 英镑充值档位。"],
    ["第二步：提交订单", "填写接收邮箱并提交订单，等待系统或客服交付 16 位充值卡密。"],
    [
      "第三步：打开充值页面",
      "进入 Giffgaff 官网或 App 的 Top-up / Voucher 兑换入口。",
    ],
    [
      "第四步：输入卡密",
      "输入收到的 16 位充值卡密并确认兑换，完成后检查余额或套餐状态。",
    ],
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-5">
        <div className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700">
          Giffgaff | 16位卡密充值
        </div>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">
          {product.name}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          Giffgaff 充值商品采用 16 位卡密交付。下单前请确认需要的充值面额，
          收到卡密后前往 Giffgaff 官网或 App 自助兑换，并第一时间检查到账状态。
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white">
        <div className="bg-orange-600 px-5 py-4 text-center text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-orange-100">
            Top-up Highlights
          </div>
          <div className="mt-1 text-lg font-bold">卡密发货，自助充值</div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-center"
              >
                <Icon className="mx-auto h-7 w-7 text-orange-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-orange-700" />
          商品说明与充值方式
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 text-sm leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-orange-700" />
          使用步骤
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-rose-700">
          <Clock3 className="h-5 w-5" />
          售后与注意事项
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {[
            "收到 16 位卡密后请尽快兑换并核验余额或套餐状态。",
            "请勿将卡密泄露给他人，卡密一经兑换即无法撤回。",
            "如果充值失败，请保留页面提示和卡密信息，在售后期内联系在线客服处理。",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AppleIdDetails({ product }: { product: Product }) {
  const highlights = [
    {
      icon: ShieldCheck,
      title: "独享成品账号",
      text: "账号独立交付，适合 App Store 海外区应用和游戏下载使用。",
    },
    {
      icon: RefreshCcw,
      title: "带密保可改密",
      text: "交付后可通过密保信息验证身份，建议第一时间修改密码。",
    },
    {
      icon: Smartphone,
      title: "App Store 使用",
      text: "仅建议在 App Store 登录下载，不要登录 iCloud 或设备设置。",
    },
    {
      icon: CheckCircle2,
      title: "账号信息齐全",
      text: "按商品交付账号、密码、密保答案等必要登录信息。",
    },
    {
      icon: Clock3,
      title: "24 小时售后",
      text: "收到账号后请第一时间检查，售后期为商品发货后 24 小时内。",
    },
    {
      icon: Target,
      title: "合规用途",
      text: "仅限合法电商拓客和正常应用下载场景，不提供违法用途支持。",
    },
  ];

  const rules = [
    ["商品内容", `${product.name}，带密保可改密，独享账号。`],
    ["适用场景", "用于 App Store 下载对应地区上架的海外 App 或游戏。"],
    ["交付信息", "发货后请核对账号、密码、密保答案、生日等信息是否完整可用。"],
    ["重要限制", "不要在“设置 / iCloud / 查找”中登录，避免触发设备锁或账号异常。"],
    ["售后期限", "账号类商品售后期为商品发货后 24 小时内，超时请按页面说明处理。"],
  ];

  const steps = [
    ["第一步：下单并接收账号", "选择对应地区 Apple ID 商品，完成下单后获取账号交付信息。"],
    ["第二步：先检查账号信息", "收到后第一时间核对账号、密码、密保答案和生日信息，确认能正常验证。"],
    [
      "第三步：建议先修改密码",
      <>
        打开{" "}
        <a
          href="https://appleid.apple.com/"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sky-700 underline underline-offset-4 hover:text-sky-600"
        >
          appleid.apple.com
        </a>
        ，使用密保问题、答案和生日验证后修改为自己的新密码。
      </>,
    ],
    ["第四步：只在 App Store 登录", "打开 App Store，点击右上角头像登录账号；不要在系统设置或 iCloud 登录。"],
    ["第五步：下载目标 App", "搜索并下载需要的海外 App 或游戏。付费或订阅类 App 需自行充值或绑定支付方式。"],
  ];

  const notices = [
    "登录时如出现“升级账号安全性”等提示，请选择其他选项或暂不升级，避免绑定到非本人设备。",
    "已安装 App 若提示需要原 ID 更新，可卸载后使用当前账号重新下载。",
    "搜索不到 App 时，请先确认该 App 是否在当前账号地区上架。",
    "账号或密码错误时，请确认是在 App Store 内登录，并检查复制内容是否包含空格。",
    "用户登录 iCloud、频繁切换地区/设备、批量改密或违规使用导致的异常，不在售后范围内。",
  ];

  const faqs = [
    ["可以登录 iCloud 吗？", "不可以。该商品仅建议用于 App Store 下载，登录 iCloud 或“查找”可能导致设备锁或账号异常。"],
    ["可以修改密码吗？", "可以，建议收到账号后第一时间通过 appleid.apple.com 使用密保信息修改密码。"],
    ["是否独享？", "Apple ID 商品为独享账号，交付后请尽快检查并按说明修改密码。"],
    ["为什么老 App 要原 ID 更新？", "App 会绑定首次下载时使用的 Apple ID，遇到这种情况可卸载后用当前账号重新下载。"],
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white">
        <div className="relative bg-gradient-to-br from-sky-500 via-blue-600 to-blue-900 px-6 py-8 text-white">
          <div className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold">
            海外 App Store | 即买即用
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight">
            Apple ID 独享成品账号
          </h2>
          <p className="mt-2 text-base font-semibold text-sky-100">
            带密保可改密，适合海外 App / 游戏下载
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-sky-50/90">
            本商品面向 App Store 下载使用场景。下单前请确认目标 App 在对应地区上架，收到账号后请第一时间检查并按说明使用。
          </p>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 text-center"
              >
                <Icon className="mx-auto h-7 w-7 text-sky-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-sky-700" />
          商品说明与交付规则
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3 text-sm leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-800">
            温馨提示：请勿用于共享账号、二次转售、违规注册或任何违法用途。
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-sky-700" />
          使用方法
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-rose-700">
          <Clock3 className="h-5 w-5" />
          售后与风险提示
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {notices.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <Target className="h-5 w-5 text-sky-700" />
          快速 FAQ
        </h3>
        <div className="mt-4 space-y-3">
          {faqs.map(([question, answer]) => (
            <details
              key={question}
              className="rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                {question}
              </summary>
              <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function GptPremadeAccountDetails({ product }: { product: Product }) {
  const accountHighlights = [
    {
      icon: Sparkles,
      title: "Plus 尊享权益",
      desc: "包含 GPT-4o / GPT-4 / o1 全模型使用权，DALL-E 3 绘图、高级数据分析及联网搜索能力。",
    },
    {
      icon: ShieldCheck,
      title: "官方纯正成品号",
      desc: "质保 1 天（稳定批次部分已存活 20 天+），纯正一手海外家宽独享注册，发货即用。",
    },
    {
      icon: Zap,
      title: "独立独享交付",
      desc: "交付独享账号、密码以及配套邮箱，一人一号，可自行绑定手机号与修改密码。",
    },
    {
      icon: Clock3,
      title: "自动秒级发货",
      desc: "下单后系统自动分配卡密账号并展示在订单页面，无需繁琐等待人工发货。",
    },
  ];

  const specs = [
    ["商品名称", product.name],
    ["账号规格", "ChatGPT Plus 官方订阅独享成品号（含配套邮箱及初始登录凭证）"],
    ["质保服务", "首发激活质保 24 小时（部分批次已稳定存活 20 天以上；正常使用不滥用 API 可长久续费）"],
    ["交付格式", "账号/邮箱 ---- 密码 ---- 2FA 动态密钥 ---- 辅助邮箱密码"],
    ["网络环境要求", "必须使用正规、纯净的海外节点（如美区、新加坡、日本等住宅或正规代理），切忌香港/大陆/频繁变动节点"],
    ["推荐配置", "配合指纹浏览器独立环境或无痕浏览器窗口使用，杜绝多账号共用同一浏览器缓存导致风控关联"],
  ];

  return (
    <div className="mt-8 w-full space-y-6">
      {/* 1. 第一栏：产品介绍和特点 */}
      <section className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-teal-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100/80 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            官方独享 · 独立成品
          </span>
          <span className="text-xs font-semibold text-emerald-700">自动发货 · 质保 24 小时</span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {product.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          已开通 ChatGPT Plus 会员服务，独享账号直接上手使用。纯手工家宽环境注册，无共享风险，支持修改密码与长期保号。
        </p>

        {/* 亮点卡片网格 */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {accountHighlights.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex items-start gap-3 rounded-xl border border-white/80 bg-white/70 p-3.5 shadow-sm backdrop-blur-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-0.5 text-xs leading-5 text-slate-500">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 第二栏：商品详细规格与交付标准 */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-bold text-slate-900">商品详细规格与交付标准</h3>
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 text-xs sm:text-sm">
          {specs.map(([label, value], i) => (
            <div key={i} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="w-28 shrink-0 font-semibold text-slate-500">{label}</span>
              <span className="font-medium text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 第三栏：发货格式说明 */}
      <section className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-teal-50/40 to-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 text-emerald-800">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-bold text-slate-900">独享交付标准与发货格式说明</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          下单完成后，系统自动生成卡密。标准发货内容包含 4 段关键信息（以四个横杠 ---- 分隔）：
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-200 bg-white/95 p-3.5 font-mono text-xs text-slate-800 shadow-inner">
          <div className="text-slate-400">// 独享成品号标准交付格式</div>
          <div className="mt-1 font-semibold text-emerald-700">
            user_example@gmail.com ---- Passwd1234 ---- 3H5HRIM7SZHRFSJ22YMHO ---- EmailPasswd
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 sm:grid-cols-4">
            <div>① 账号/登录邮箱</div>
            <div>② 登录初始密码</div>
            <div>③ 2FA 动态安全密钥</div>
            <div>④ 辅助邮箱初始密码</div>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-3 text-xs text-emerald-800">
          <span className="inline-flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            一人一号独立独享
          </span>
          <span className="inline-flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            支持修改密码与改绑 2FA
          </span>
          <span className="inline-flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            绝无二次销售或共享合租
          </span>
        </div>
      </section>

      {/* 4. 第四栏：质保服务 */}
      <section className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 via-blue-50/40 to-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-600" />
          <h3 className="text-base font-bold text-slate-900">24 小时首发包换服务承诺</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          本站所售成品号均为正规纯净一手注册，为您提供放心的售后质保保障：
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-sky-100 bg-white/90 p-3.5 shadow-2xs">
            <div className="text-xs font-bold text-sky-900">密码/账号异常包换</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              收号 24 小时内首次登录若提示密码错误或邮箱不存在，联系客服即刻换新。
            </div>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/90 p-3.5 shadow-2xs">
            <div className="text-xs font-bold text-sky-900">2FA 验证码异常包换</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              若提供的 2FA 密钥计算验证码无法通过系统校验，质保期内无条件更换新凭证。
            </div>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/90 p-3.5 shadow-2xs">
            <div className="text-xs font-bold text-sky-900">首次登录风控包换</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              在合规海外网络环境下，若首登发现账号在交付前已被官方注销，补发全新账号。
            </div>
          </div>
        </div>
      </section>

      {/* 5. 第五栏：教程直达引导横幅 (简单清爽，查阅教程) */}
      <ChatGptGuideHeroBanner actionText="查阅教程" />

      {/* 6. 第六栏：注意事项 */}
      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <h3 className="text-base font-bold text-slate-900">注意事项</h3>
        </div>
        <p className="mt-1 text-xs text-slate-600 sm:text-sm">
          OpenAI 封号 99% 源于「黑名单节点 IP 污染」与「多账号同一浏览器指纹混用」，请严格遵守以下防封规范：
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3.5 text-xs sm:text-sm">
            <strong className="text-amber-900">1. 节点纯净度是生命线：</strong>
            <span className="text-slate-600">
              绝不使用公共免费节点或低质万人挤机房节点。推荐美、日、新等合规优质住宅或正规小众节点，切忌短时间内在不同国家地区频繁跳跃漂移！
            </span>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3.5 text-xs sm:text-sm">
            <strong className="text-amber-900">2. 指纹浏览器独立环境隔离：</strong>
            <span className="text-slate-600">
              严禁在同一普通浏览器窗口下同时登录多个账号！推荐使用防关联指纹浏览器（如 AdsPower、Hubstudio）或 Chrome 独立 Profile 专属配置独立使用。
            </span>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3.5 text-xs sm:text-sm">
            <strong className="text-amber-900">3. 新号前 24 小时平稳过渡：</strong>
            <span className="text-slate-600">
              首次登录后建议先进行常规轻量提问（正常对话 2-3 轮），切忌刚拿到就立即挂载高并发批量自动化脚本或尝试极端敏感提问。
            </span>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3.5 text-xs sm:text-sm">
            <strong className="text-amber-900">4. 遇抽检接码使用实体 SIM 卡：</strong>
            <span className="text-slate-600">
              若遇到 OpenAI 官方抽检短信验证，切勿使用公共免费临时虚拟接码平台。可搭配本站真实海外实体 SIM 卡（如英国 giffgaff、新西兰 One NZ）0 月租高信誉接码。
            </span>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-1">
              <a
                href="https://chatgpt.com/zh-Hans-CN/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800"
              >
                <Download className="h-3 w-3" />
                <span>官方客户端下载</span>
              </a>
              <Link
                href="/products/sim-cards"
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-amber-600"
              >
                <Smartphone className="h-3 w-3" />
                <span>选购国际 SIM 卡接码</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 7. 第七栏：成品号常见疑问与售后速查 (FAQ) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-bold text-slate-900">成品号常见疑问与售后速查 (FAQ)</h3>
        <div className="mt-4 space-y-3 text-xs leading-6 text-slate-600 sm:text-sm">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
            <div className="font-bold text-slate-900">Q: 账号是永久的吗？能改成我自己的邮箱吗？</div>
            <div className="mt-1 text-slate-600">
              交付的是独立独享账号与配套邮箱。OpenAI 官方目前不支持直接更改主登录邮箱，但您可以完全修改登录密码、绑定个人独享 2FA 密钥以及绑定您自己的手机号，实现 100% 独享安全控制权。
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
            <div className="font-bold text-slate-900">Q: 为什么有时打开页面提示 "Access denied" (403)？</div>
            <div className="mt-1 text-slate-600">
              这是 OpenAI 云盾风控系统对您当前代理节点 IP 的临时拦截，与账号本身无关。请切换至纯净优质的海外住宅代理节点，或开启浏览器无痕窗口重新刷新即可正常访问。
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
            <div className="font-bold text-slate-900">Q: Plus 质保到期后，下个月还能继续充值续费吗？</div>
            <div className="mt-1 text-slate-600">
              完全可以！到期后可在本站选购「ChatGPT 会员充值」卡密或使用正规海外卡直接续费，所有历史会话、自定义 GPTs 及配置均完整保留。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatGptGuideHeroBanner({
  title = "需要 ChatGPT 详细图文操作与保号指引？",
  subtitle = "含首登验码、修改密码、2FA 密钥换绑、剔除陌生设备及全套防封养号核心指南",
  actionText = "查阅教程",
}: {
  title?: string;
  subtitle?: string;
  actionText?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 p-5 text-white shadow-md sm:p-6 border border-slate-800">
      <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 border border-primary/30 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white sm:text-lg">{title}</h4>
            <p className="mt-1 text-xs text-slate-300 sm:text-sm">{subtitle}</p>
          </div>
        </div>
        <Link
          href="/tutorials?topic=chatgpt-guide"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 sm:text-sm"
        >
          <span>{actionText}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function GptRechargeDetails({ product }: { product: Product }) {
  const steps = [
    {
      num: "1",
      title: "提取专属 CDK 卡密",
      desc: "下单完成后，在订单详情页面或您填写的接收邮箱中复制专属充值兑换卡密。",
    },
    {
      num: "2",
      title: "打开兑换站验证卡密",
      desc: "访问自助兑换系统，在「充值提交」输入框粘贴卡密，先点击【验证 CDK】确认卡密状态。",
      link: {
        text: "访问卡密兑换站",
        url: "https://cdk-card.dajuai.us/",
      },
    },
    {
      num: "3",
      title: "获取 Session 提交充值",
      desc: (
        <>
          网页端登录你的免费版 ChatGPT 账号后，打开{" "}
          <a
            href="https://chatgpt.com/api/auth/session"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline underline-offset-2 hover:opacity-85"
          >
            获取 Session
          </a>
          ，复制页面返回的全部 JSON（也可只复制 accessToken），粘贴到兑换站并确认提交。
        </>
      ),
    },
    {
      num: "4",
      title: "处理开通会员",
      desc: "系统全自动充值处理，一般 1-3 分钟内即刻生效，登录 Chat GPT 刷新即可点亮会员权益。",
    },
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      {/* 头部品牌横幅：服务亮点与商品说明与交付规则 */}
      <section className="relative overflow-hidden rounded-2xl border border-orange-200/90 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-orange-500/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100/80 px-3 py-1 text-xs font-semibold text-orange-800">
            <Zap className="h-3.5 w-3.5 text-orange-600" />
            服务亮点 · 官方直充自动开通
          </span>
          <span className="text-xs font-semibold text-orange-700">商品说明与交付规则 · 极速兑换</span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {product.name}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {product.description || "全自动卡密充值，支持个人免费号升级续费。正规官方渠道结算，畅享 GPT-4o / o1 全模型高速算力与高级数据分析。"}
        </p>
      </section>

      {/* 充值方式对比 */}
      <ChatGptRechargeMethodComparison />

      {/* 兑换流程 4 步（使用方法） */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">🧾 4 步极简自助充值兑换流程（使用方法）</h3>
            <p className="text-xs text-slate-500">直连自动兑换站，卡密验证后 1-3 分钟全自动开通</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {steps.map((st) => (
            <div key={st.num} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shadow-2xs">
                {st.num}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 sm:text-sm">{st.title}</h4>
                <div className="mt-1 text-xs leading-5 text-slate-600">{st.desc}</div>
                {st.link ? (
                  <a
                    href={st.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    <span>{st.link.text}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 下单前自检清单（适用场景） */}
      <section className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-orange-50/30 to-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-amber-600" />
          <h3 className="text-base font-bold text-slate-900">✅ 使用范围与适用场景（下单前请自检）</h3>
        </div>
        <p className="mt-1 text-xs text-rose-600 font-semibold sm:text-sm">
          不满足条件请不要提交，本商品不可覆盖已有订阅：
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200/80 bg-white/95 p-4 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 sm:text-sm">
              <span className="text-emerald-600 font-black">✔</span>
              <span>仅限免费版账号</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              当前必须是没有任何订阅的免费版 ChatGPT 账号，或卡付充值到期的账号（免费账号均可正常开通；iOS 全区充值可覆盖，卡付不可覆盖）。
            </p>
          </div>

          <div className="rounded-xl border border-rose-200/80 bg-white/95 p-4 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 sm:text-sm">
              <span className="text-rose-600 font-black">✘</span>
              <span>不可覆盖已有订阅</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              账号当前已有 Go、Plus、Pro 或其他有效订阅，不能用本商品覆盖或升级。提交了也不会按覆盖处理。
            </p>
          </div>
        </div>
      </section>

      {/* 教程直达横幅 */}
      <ChatGptGuideHeroBanner
        title="需要账户保号与使用环境配置指导？"
        subtitle="查阅 ChatGPT 账号安全防封、海外节点选择、多设备登录与保号指南"
        actionText="查阅教程"
      />

      {/* 常见问题 FAQ */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-orange-500" />
          <h3 className="text-base font-bold text-slate-900">❓ 常见问题 FAQ</h3>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <h4 className="text-xs font-bold text-slate-900 sm:text-sm">▼ Q1：怎么完成充值？</h4>
            <p className="mt-1.5 text-xs leading-5 text-slate-600 sm:text-sm">
              打开兑换站{" "}
              <a
                href="https://cdk-card.dajuai.us/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-primary underline underline-offset-2 hover:opacity-85"
              >
                https://cdk-card.dajuai.us/
              </a>
              ，先验证 CDK，再提交 Session。Session 获取方式：网页登录 ChatGPT 后访问{" "}
              <a
                href="https://chatgpt.com/api/auth/session"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-primary underline underline-offset-2 hover:opacity-85"
              >
                https://chatgpt.com/api/auth/session
              </a>
              ，复制返回的全部 JSON 或 accessToken。
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <h4 className="text-xs font-bold text-slate-900 sm:text-sm">▼ Q2：有账单可以查吗？</h4>
            <p className="mt-1.5 text-xs leading-5 text-slate-600 sm:text-sm">
              有。正规卡充，带官方账单。可在 GPT 官网下载：左下角头像 → 设置 → 账单 → 查看。
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <h4 className="text-xs font-bold text-slate-900 sm:text-sm">▼ Q3：质保多久？掉订阅怎么处理？</h4>
            <p className="mt-1.5 text-xs leading-5 text-slate-600 sm:text-sm">
              充值成功后质保30日订阅。质保期内掉订阅，按剩余天数退赔。
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <h4 className="text-xs font-bold text-slate-900 sm:text-sm">▼ Q4：充值未到账怎么办？</h4>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-5 text-slate-600 sm:text-sm">
              <li>网页版刷新网页，查看右下角头像下方有没有出现相应权益</li>
              <li>在 Jianlian.shop 我的订单里查询充值订单卡密，到兑换站查询充值账号是否有误</li>
              <li>自查左下角头像 → 设置 → 账单 → 查看。有没有相对应的充值记录</li>
              <li>自查后没有请联系人工客服，协助查询</li>
            </ol>
          </div>
        </div>
      </section>

      {/* 售后与注意事项 */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-bold text-slate-900">售后与注意事项（售后保障与温馨提示）</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-6 text-slate-600 sm:text-sm">
          <li>卡密为一次性官方兑换凭证，发货后请尽快前往兑换站完成充值。</li>
          <li>充值前请仔细核对兑换站输入的账号邮箱，避免误充至其他账号。</li>
          <li>如遇兑换站提示卡密异常或账号充值超时，请保留订单详情随时联系在线客服优先排查处理。</li>
        </ul>
      </section>
    </div>
  );
}

function GrokRechargeDetails({ product }: { product: Product }) {
  const highlights = [
    {
      icon: Zap,
      title: "自动充值，稳定到账",
      text: "下单后进入 Grok 充值地址自助兑换，系统自动完成 Grok Super 充值。",
    },
    {
      icon: Sparkles,
      title: "Grok Super 充值",
      text: "印度区 iOS Grok Super 充值 30 刀，支持安卓、iOS 和网页端使用。",
    },
    {
      icon: Smartphone,
      title: "安卓 / iOS 通用",
      text: "同一账号可在安卓、iOS、网页端登录查看 Super 状态。",
    },
    {
      icon: CheckCircle2,
      title: "卡密永久有效",
      text: "未使用卡密永久有效，不会过期；兑换成功后按 Grok Super 规则生效。",
    },
    {
      icon: RefreshCcw,
      title: "支持提前续费",
      text: "无需等会员到期，可提前续费，会覆盖剩余时间并继续累计。",
    },
    {
      icon: Target,
      title: "30 天保障",
      text: "质保 30 天不掉订阅，掉订阅按天退差价。",
    },
  ];

  const rules = [
    ["商品内容", `${product.name}，印度区 iOS 充值，安卓 / iOS 通用。`],
    [
      "充值地址",
      <RechargeLink key="grok-recharge-link" href="https://aikkcc.com/" />,
    ],
    ["发货模式", "购买后获得充值卡密，未使用卡密永久有效，不会过期。"],
    ["到账说明", "充值完成后通常会自动到账；如长时间未到账，请先核对账号信息，再联系在线客服处理。"],
  ];

  const steps = [
    ["第一步：下单购买", `选择 ${product.name} 商品并完成下单。`],
    [
      "第二步：打开充值页面",
      <>
        访问充值地址{" "}
        <RechargeLink href="https://aikkcc.com/" /> 进入 Grok 兑换页面。
      </>,
    ],
    ["第三步：自助兑换", "在兑换页面填写卡密和 Grok 账号充值信息，确认无误后提交。"],
    ["第四步：等待到账", "提交后系统自动完成充值，到 Grok 官网或 App 查看 Super 状态。"],
  ];

  const troubleshooting = [
    "如未到账，请先核对 Grok 账号信息是否填写正确。",
    "必要时退出账号后重新登录，再查看 Grok Super 状态。",
    "常见封号原因包括：批量注册的 3.5 账号、账号共享、频繁更换 IP、敏感问题、翻译敏感话术等，封号通常不是充值本身导致。",
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
        <div className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">
          Grok Super | CDK 自动充值
        </div>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">
          {product.name}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          面向已有账号的 Grok Super 自动充值服务。下单后在 Grok 充值页面自助兑换即可自动到账，支持安卓、iOS 和网页端使用。
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white">
        <div className="bg-sky-700 px-5 py-4 text-center text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-100">
            Service Highlights
          </div>
          <div className="mt-1 text-lg font-bold">自动充值，稳定到账</div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 text-center"
              >
                <Icon className="mx-auto h-7 w-7 text-sky-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-sky-700" />
          商品说明与交付规则
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3 text-sm leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
          <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm font-medium leading-6 text-sky-800">
            温馨提示：充值成功后请及时登录账号查看 Grok Super 状态。
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-sky-700" />
          使用方法
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-rose-700">
          <Clock3 className="h-5 w-5" />
          售后与注意事项
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {troubleshooting.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ClaudeRechargeDetails({ product }: { product: Product }) {
  const isMaxPlan = product.id.includes("max");
  const planLabel = product.id.includes("20x")
    ? "Claude Max X20"
    : product.id.includes("5x")
      ? "Claude Max X5"
      : "Claude Pro";

  const highlights = [
    {
      icon: Zap,
      title: "CDK 自助兑换",
      text: "下单后获得充值卡密，进入 Claude 充值页面按提示自助兑换。",
    },
    {
      icon: Sparkles,
      title: `${planLabel} 套餐`,
      text: isMaxPlan
        ? "适合高频使用和更高额度需求，按所选 Max 套餐开通。"
        : "适合日常 Claude Pro 使用，支持常规对话、写作和办公场景。",
    },
    {
      icon: Smartphone,
      title: "安卓 / iOS 通用",
      text: "安卓、iOS、网页端账号均可使用，兑换成功后登录账号查看会员状态。",
    },
    {
      icon: CheckCircle2,
      title: "卡密永久有效",
      text: "未使用卡密永久有效，不会过期；兑换成功后按会员周期生效。",
    },
    {
      icon: RefreshCcw,
      title: "支持提前续费",
      text: "无需等会员到期，可提前续费，剩余时间按平台规则覆盖或累计。",
    },
    {
      icon: Target,
      title: "30 天保障",
      text: "质保 30 天不掉订阅，掉订阅按天退差价。",
    },
  ];

  const rules = [
    ["商品内容", `${product.name}，适用于 Claude 会员充值。`],
    [
      "充值地址",
      <RechargeLink key="claude-recharge-link" href="https://aikkcc.com/" />,
    ],
    ["发货模式", "购买后获得充值卡密，未使用卡密永久有效，不会过期。"],
    ["到账说明", "兑换提交后通常会自动处理到账；如长时间未到账，请先核对账号信息，再联系在线客服。"],
    ["适用说明", `${planLabel} 为一次性 CDK 充值商品，售出后不支持无理由退换。`],
  ];

  const steps = [
    ["第一步：下单购买", `选择 ${product.name} 商品并完成下单。`],
    [
      "第二步：打开充值页面",
      <>
        访问充值地址{" "}
        <RechargeLink href="https://aikkcc.com/" /> 进入 Claude 兑换页面。
      </>,
    ],
    ["第三步：自助兑换", "在兑换页面填写卡密和 Claude 账号充值信息，确认无误后提交。"],
    ["第四步：等待到账", `提交后系统自动处理充值，到 Claude 官网或 App 查看 ${planLabel} 状态。`],
  ];

  const troubleshooting = [
    "如未到账，请先核对 Claude 账号信息是否填写正确。",
    "必要时退出账号后重新登录，再查看 Claude 会员状态。",
    "账号共享、频繁更换 IP、敏感问题、异常注册或违规使用导致的账号限制，通常不属于充值本身问题。",
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-5">
        <div className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700">
          Claude | CDK 自动充值
        </div>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">
          {product.name}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          面向已有账号的 Claude 会员 CDK 充值服务。下单后在充值页面自助兑换，支持安卓、iOS 和网页端使用。
          请按页面提示填写账号信息，提交前仔细核对。
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white">
        <div className="bg-orange-600 px-5 py-4 text-center text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-orange-100">
            Service Highlights
          </div>
          <div className="mt-1 text-lg font-bold">自助兑换，稳定到账</div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-center"
              >
                <Icon className="mx-auto h-7 w-7 text-orange-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-orange-700" />
          商品说明与交付规则
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 text-sm leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
          <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-medium leading-6 text-orange-800">
            温馨提示：充值成功后请及时登录账号查看 Claude 会员状态和订阅到期时间。
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-orange-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-orange-700" />
          使用方法
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-rose-700">
          <Clock3 className="h-5 w-5" />
          售后与注意事项
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {troubleshooting.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function renderTextWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s，。、）)]+)/g);
  return parts.map((part, idx) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={idx}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-primary underline underline-offset-4 break-all hover:text-primary/80"
      >
        {part}
      </a>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}

function GeminiCustomDetailSections({ detailText }: { detailText: string }) {
  const blocks = detailText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const firstLine = lines[0] ?? "";
        const headingMatch = firstLine.match(/^【(.+?)】$/);
        const heading = headingMatch ? headingMatch[1] : null;
        const bodyLines = heading ? lines.slice(1) : lines;
        const isHighlightBox = heading && /兑换|使用地址|教程/.test(heading);
        const isWarningBox = heading && /必读|须知|售后|注意/.test(heading);

        return (
          <section
            key={index}
            className={cn(
              "rounded-2xl border p-5",
              isHighlightBox
                ? "border-orange-200 bg-orange-50/60"
                : isWarningBox
                  ? "border-rose-200/80 bg-rose-50/40"
                  : "border-slate-200/90 bg-white"
            )}
          >
            {heading ? (
              <h3
                className={cn(
                  "mb-3 flex items-center gap-2 text-base font-bold",
                  isHighlightBox
                    ? "text-orange-900"
                    : isWarningBox
                      ? "text-rose-700"
                      : "text-slate-900"
                )}
              >
                {isHighlightBox ? (
                  <Zap className="h-4 w-4 text-primary" />
                ) : isWarningBox ? (
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                )}
                {heading}
              </h3>
            ) : null}
            <div className="space-y-2 text-sm leading-7 text-slate-700">
              {bodyLines.map((line, lineIdx) => (
                <p key={lineIdx}>{renderTextWithLinks(line)}</p>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GeminiGoogleTutorialFooter() {
  return (
    <section className="mt-6 rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/90 via-indigo-50/55 to-blue-50/90 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <BookOpen className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              需要 Google 账号改区、绑卡或扫码降级短信教程？
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              点击前往站内 Google 使用教程中心查看完整图文指引。
            </p>
          </div>
        </div>
        <Link
          href="/tutorials?topic=google-region"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          <span>查看 Google 教程</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function GeminiRechargeDetails({ product }: { product: Product }) {
  const isLegacyPixelTemplate = GEMINI_RECHARGE_PRODUCT_IDS.includes(product.id);
  const customDetail = (product.detail || "").trim();

  if (!isLegacyPixelTemplate && customDetail) {
    return (
      <div className="mt-8 w-full space-y-5">
        <GeminiCustomDetailSections detailText={customDetail} />
        <GeminiGoogleTutorialFooter />
      </div>
    );
  }

  const isYearAccount = product.id.includes("1y");
  const planLabel = isYearAccount
    ? "Google One Pro 一年高权重成品号"
    : "Google One Pro Pixel 开通";

  const highlights = [
    {
      icon: Zap,
      title: "自助激活",
      text: "下单后按商品交付信息进入激活网站，自助完成 Google One Pro 激活。",
    },
    {
      icon: Sparkles,
      title: planLabel,
      text: isYearAccount
        ? "适合需要一年期账号权益的用户，按成品号信息交付使用。"
        : "适合 Google One Pro / Gemini 相关权益使用，按 Pixel 开通规则处理。",
    },
    {
      icon: Smartphone,
      title: "多端使用",
      text: "激活后按 Google 账号规则在网页端、安卓和 iOS 端查看对应权益。",
    },
    {
      icon: CheckCircle2,
      title: "按库存发货",
      text: "库存以页面显示为准，库存为 0 或不确定时请先联系在线客服确认。",
    },
    {
      icon: RefreshCcw,
      title: "下单前核对",
      text: "购买前请确认商品类型、账号要求和使用地区，避免买错规格。",
    },
    {
      icon: Target,
      title: "售后核验",
      text: "收到交付信息后请第一时间检查，售后期按商品说明处理。",
    },
  ];

  const rules = [
    ["商品内容", `${product.name}，适用于 Gemini / Google One Pro 相关权益。`],
    [
      "激活网站",
      <RechargeLink key="gemini-recharge-link" href="https://aikkcc.com/" />,
    ],
    [
      "发货模式",
      isYearAccount
        ? "购买后按成品号信息交付，请收到后第一时间核验账号状态。"
        : "购买后按商品说明交付激活信息，请进入激活网站自助处理。",
    ],
    [
      "使用说明",
      "激活前请仔细核对 Google 账号、地区和商品规格；提交错误信息可能影响到账或使用。",
    ],
    [
      "售后说明",
      "数字权益/账号类商品属于一次性商品，非商品问题售出后不支持无理由退换。",
    ],
  ];

  const steps = [
    ["第一步：下单购买", `选择 ${product.name} 商品并完成下单。`],
    [
      "第二步：打开激活网站",
      <>
        访问激活网站{" "}
        <RechargeLink href="https://aikkcc.com/" /> 进入自助激活页面。
      </>,
    ],
    [
      "第三步：填写信息",
      "按页面提示填写交付信息、账号信息或卡密信息，提交前确认无误。",
    ],
    [
      "第四步：核验权益",
      "激活完成后登录对应 Google / Gemini 页面查看 Google One Pro 或 Gemini 权益状态。",
    ],
  ];

  const troubleshooting = [
    "如未生效，请先核对账号、地区和提交信息是否正确。",
    "必要时退出账号后重新登录，再查看 Google One Pro / Gemini 权益状态。",
    "账号异常、频繁更换 IP、地区不匹配、共享账号或违规使用导致的限制，通常不属于商品本身问题。",
  ];

  return (
    <div className="mt-8 w-full space-y-5">
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
        <div className="inline-flex rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
          Gemini | Google One Pro 自助激活
        </div>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">
          {product.name}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          面向 Gemini / Google One Pro 相关权益的自助激活商品。下单后根据交付信息进入激活网站处理，
          请在提交前仔细核对账号、地区和商品规格。
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white">
        <div className="bg-indigo-700 px-5 py-4 text-center text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-100">
            Service Highlights
          </div>
          <div className="mt-1 text-lg font-bold">自助激活，按说明交付</div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 text-center"
              >
                <Icon className="mx-auto h-7 w-7 text-indigo-700" />
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <ShieldCheck className="h-5 w-5 text-indigo-700" />
          商品说明与交付规则
        </h3>
        <div className="mt-4 space-y-3">
          {rules.map(([label, text]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-indigo-100 bg-indigo-50/30 px-4 py-3 text-sm leading-6"
            >
              <span className="font-semibold text-slate-950">{label}：</span>
              <span className="text-slate-600">{text}</span>
            </div>
          ))}
          <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium leading-6 text-indigo-800">
            温馨提示：激活完成后请及时登录账号查看 Gemini / Google One Pro 权益状态。
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-indigo-700" />
          使用方法
        </h3>
        <div className="mt-4 space-y-3">
          {steps.map(([title, text]) => (
            <div
              key={String(title)}
              className="rounded-xl border border-indigo-100 bg-indigo-50/30 px-4 py-3"
            >
              <div className="text-sm font-semibold text-slate-950">
                {title}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <h3 className="flex items-center gap-2 text-base font-bold text-rose-700">
          <Clock3 className="h-5 w-5" />
          售后与注意事项
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {troubleshooting.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <GeminiGoogleTutorialFooter />
    </div>
  );
}

function RechargeLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
    >
      aikkcc.com
    </a>
  );
}

function SkuSelector({
  options,
  selectedSkuId,
  onSelectSku,
  disabled,
}: {
  options: SkuOption[];
  selectedSkuId: string;
  onSelectSku: (skuId: string) => void;
  disabled?: boolean;
}) {
  if (options.length <= 1) return null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((sku) => {
          const selected = selectedSkuId === sku.id;

          return (
            <button
              type="button"
              key={sku.id}
              onClick={() => onSelectSku(sku.id)}
              disabled={disabled || sku.status !== "active" || Number(sku.stock ?? 0) <= 0}
              className={cn(
                "min-w-0 rounded-lg border bg-white px-3 py-3 text-center transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-70",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              )}
            >
              <div className="truncate text-base font-bold text-foreground">
                {sku.label}
              </div>
              <div className="mt-1 break-words text-[13px] font-bold leading-tight text-slate-950">
                ¥{sku.rmb.toFixed(2)}
              </div>
              {sku.status !== "active" || Number(sku.stock ?? 0) <= 0 ? <div className="mt-1 text-xs text-slate-500">已售罄</div> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductArtwork({ product }: { product: Product }) {
  const imageSrc = getProductImage(product);

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={product.name}
        className="h-40 w-40 rounded-2xl object-cover shadow-sm"
      />
    );
  }

  const Icon = getProductFallbackIcon(product);
  return (
    <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-primary/10">
      <Icon className="h-16 w-16 text-primary" />
    </div>
  );
}

function DetailMetric({
  label,
  value,
  highlight,
  success,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={[
          "mt-2 text-sm font-semibold",
          highlight ? "font-bold text-slate-950" : "",
          success ? "text-green-600" : "",
          danger ? "text-red-500" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function getProductImage(product: Product) {
  const customImg = product.image || (product as any).imageUrl || (product as any).image_url;
  if (customImg && typeof customImg === "string" && customImg.trim()) {
    return resolveProductImageSrc(customImg.trim());
  }
  const name = product.name.toLowerCase();
  if (
    product.id === GPT_RECHARGE_PRODUCT_ID ||
    product.id === "ai-001" ||
    name.includes("chatgpt")
  ) {
    return "/assets/ai-chatgpt-icon.jpg";
  }
  if (CLAUDE_RECHARGE_PRODUCT_IDS.includes(product.id) || name.includes("claude")) {
    return "/assets/ai-claude-icon.jpg";
  }
  if (GEMINI_RECHARGE_PRODUCT_IDS.includes(product.id) || name.includes("gemini")) {
    return "/assets/ai-gemini-icon.jpg";
  }
  if (product.id === GROK_RECHARGE_PRODUCT_ID || name.includes("grok")) {
    return "/assets/ai-grok-icon.jpg";
  }
  if (name.includes("giffgaff")) return "/assets/giffgaff-icon.svg";
  if (product.id.startsWith("dig-apple-id-")) return "/assets/digital-apple-id.svg";
  if (product.id.startsWith("dig-steam-") || name.includes("steam")) {
    return "/assets/digital-steam.jpg";
  }
  if (product.id.startsWith("dig-gmail-") || name.includes("gmail")) {
    return "/assets/digital-gmail.svg";
  }
  if (product.id.startsWith("dig-outlook-") || name.includes("outlook")) {
    return "/assets/digital-outlook.svg";
  }
  if (product.id.startsWith("dig-telegram-") || name.includes("telegram")) {
    return "/assets/digital-telegram.svg";
  }
  if (product.id.startsWith("dig-whatsapp-") || name.includes("whatsapp")) {
    return "/assets/digital-whatsapp.svg";
  }
  if (product.id.startsWith("dig-tiktok-") || name.includes("tiktok")) {
    return "/assets/digital-tiktok.svg";
  }
  if (product.id.startsWith("dig-x-") || name === "x") return "/assets/digital-x.svg";
  if (product.id.startsWith("dig-instagram-") || name.includes("instagram")) {
    return "/assets/digital-instagram.svg";
  }
  if (product.id.startsWith("dig-facebook-") || name.includes("facebook")) {
    return "/assets/digital-facebook.svg";
  }
  if (product.id.startsWith("dig-youtube-") || name.includes("youtube")) {
    return "/assets/digital-youtube.svg";
  }
  if (product.id.startsWith("dig-twitch-") || name.includes("twitch")) {
    return "/assets/digital-twitch.svg";
  }
  if (product.category === "gift-cards") return "/assets/apple-gift-card-icon.jpg";
  if (name.includes("ultra")) return "/assets/ultra-mobile-icon.svg";
  if (name.includes("one nz") || name.includes("onenz") || product.id === "sim-nz-001") return "/assets/one-nz-card.png";
  if (product.category === "sim-cards") return "/assets/giffgaff-icon.svg";
  return null;
}

function getProductFallbackIcon(product: Product) {
  if (product.category === "gift-cards") return Gift;
  if (product.category === "digital-accounts") return KeyRound;
  if (product.category === "ai-membership") return Bot;
  if (product.category === "sms-code") return MessageCircle;
  if (product.category === "account-recharge") return Wallet;
  return CreditCard;
}

function getPriceLabel(product: Product, selectedSku?: SkuOption) {
  if (selectedSku) {
    return `¥${selectedSku.rmb.toFixed(2)}`;
  }

  return PRICE_LABELS[product.id] ?? `¥${product.price.toFixed(2)}`;
}

function getProductListHref(product: Product) {
  if (product.category === "gift-cards") {
    const category = product.id === "gift-giffgaff-topup" ? "giffgaff" : "apple";
    return `/products/gift-cards?category=${category}`;
  }
  if (product.category === "ai-membership") {
    const family = resolveRechargeProductFamily(product);
    return family === "other" ? "/products/ai-membership" : `/products/ai-membership?category=${family}`;
  }
  if (product.category === "sms-code") {
    return `/products/sms-code?country=${getSmsCountryByProductId(product.id)}`;
  }
  if (product.category === "sim-cards") return "/products/sim-cards";
  return `/products/${product.category}`;
}

function getSmsCountryByProductId(productId: string) {
  return productId.replace("sms-code-", "") || "us";
}

function getAiCategoryByProductId(productId: string) {
  if (productId.includes("claude")) return "claude";
  if (productId.includes("gemini")) return "gemini";
  if (productId.includes("grok")) return "grok";
  return "chatgpt";
}





