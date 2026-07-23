import { NextResponse } from "next/server";

import { getOrderErrorMessage, listUserOrders } from "@/lib/orders/order-queries";
import { getBalancePaymentErrorMessage, payOrderWithBalance } from "@/lib/orders/balance-payment-service";
import { recordOrderAgreementAcceptances, verifyCheckoutAgreements, type AgreementInput } from "@/lib/legal/legal-service";
import { normalizePaymentMethod } from "@/lib/payments/payment-methods";
import { createBep20PaymentSession, getBep20ErrorMessage } from "@/lib/payments/bep20-chain-service";
import { getUserBep20UnderpaymentWalletCredit } from "@/lib/payments/bep20-underpayment-user";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";
import { evaluateOrderRisk, riskResponseMessage, shouldBlockRisk } from "@/lib/risk/risk-service";

export const dynamic = "force-dynamic";

const ORDER_CREATE_ALLOWED_KEYS = new Set([
  "product_id",
  "productId",
  "sku_id",
  "skuId",
  "quantity",
  "client_request_id",
  "clientRequestId",
  "contact_email",
  "customer_email",
  "customer_name",
  "customer_phone",
  "shipping_address",
  "customer_note",
  "payment_method",
  "paymentMethod",
  "agreement_version_ids",
  "agreements",
]);

type SupabaseRpcError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const LEGACY_CREATE_ORDER_RPC_ARGS = [
  "p_product_id",
  "p_quantity",
  "p_customer_email",
  "p_customer_name",
  "p_customer_phone",
  "p_customer_note",
  "p_shipping_address",
];

function getSafeRpcError(error: unknown): SupabaseRpcError {
  const value = (error ?? {}) as Record<string, unknown>;
  return {
    code: typeof value.code === "string" ? value.code : null,
    message: typeof value.message === "string" ? value.message : null,
    details: typeof value.details === "string" ? value.details : null,
    hint: typeof value.hint === "string" ? value.hint : null,
  };
}

function isCreateOrderRpcSignatureMismatch(error: unknown) {
  const safe = getSafeRpcError(error);
  const text = `${safe.message ?? ""} ${safe.details ?? ""} ${safe.hint ?? ""}`;
  return (
    safe.code === "PGRST202" ||
    safe.code === "42883" ||
    /function .*create_order_with_item.* does not exist/i.test(text) ||
    /Could not find the function .*create_order_with_item/i.test(text) ||
    /No function matches the given name and argument types/i.test(text)
  );
}

function isSchemaCacheMissing(error: unknown) {
  const safe = getSafeRpcError(error);
  const text = `${safe.message ?? ""} ${safe.details ?? ""} ${safe.hint ?? ""}`;
  return (
    safe.code === "PGRST205" ||
    safe.code === "42P01" ||
    /Could not find the table/i.test(text) ||
    /schema cache/i.test(text)
  );
}

function logCreateOrderRpcError(input: {
  requestId: string;
  phase: string;
  error: unknown;
  paramNames: string[];
}) {
  const safe = getSafeRpcError(input.error);
  console.error("[Orders] create_order_with_item rpc failed", {
    request_id: input.requestId,
    phase: input.phase,
    code: safe.code,
    message: safe.message,
    details: safe.details,
    hint: safe.hint,
    param_names: input.paramNames,
  });
}

function getCreateOrderRpcFailure(error: unknown) {
  if (isCreateOrderRpcSignatureMismatch(error)) {
    return {
      status: 500,
      code: "ORDER_RPC_SIGNATURE_MISMATCH",
      error: "create_order_with_item RPC signature is incompatible with the current API payload. Check the function arguments or apply the matching migration.",
    };
  }

  if (isSchemaCacheMissing(error)) {
    return {
      status: 503,
      code: "ORDER_SCHEMA_CACHE_UNAVAILABLE",
      error: "Order schema or PostgREST schema cache is unavailable. Confirm migrations are applied and reload the schema cache.",
    };
  }

  return {
    status: 400,
    code: "ORDER_CREATE_FAILED",
    error: getOrderErrorMessage(error, "Order creation failed. Please try again later."),
  };
}

type OrderPostProcessStage =
  | "RPC_COMPLETED"
  | "ORDER_READ_STARTED"
  | "ORDER_READ_COMPLETED"
  | "ORDER_READ_FAILED"
  | "AGREEMENT_EVIDENCE_STARTED"
  | "AGREEMENT_EVIDENCE_COMPLETED"
  | "AGREEMENT_EVIDENCE_FAILED"
  | "BALANCE_PAYMENT_STARTED"
  | "BALANCE_PAYMENT_COMPLETED"
  | "BALANCE_PAYMENT_FAILED"
  | "BEP20_SESSION_STARTED"
  | "BEP20_SESSION_COMPLETED"
  | "BEP20_SESSION_FAILED"
  | "RESPONSE_BUILD_COMPLETED"
  | "UNHANDLED_POSTPROCESSING_FAILED";

function logOrderPostProcess(input: {
  level?: "info" | "warn" | "error";
  requestId: string;
  stage: OrderPostProcessStage;
  orderId?: string | null;
  orderNo?: string | null;
  error?: unknown;
}) {
  const safe = input.error ? getSafeRpcError(input.error) : null;
  const safeMessage = safe?.code
    ? `Supabase operation failed (${safe.code})`
    : input.error
      ? "Application post-processing operation failed"
      : null;
  const payload = {
    request_id: input.requestId,
    stage: input.stage,
    order_id: input.orderId ?? null,
    order_no: input.orderNo ?? null,
    supabase_error_code: safe?.code ?? null,
    safe_error_message: safeMessage,
  };

  if (input.level === "error") {
    console.error("[Orders] create post-processing", payload);
  } else if (input.level === "warn") {
    console.warn("[Orders] create post-processing", payload);
  } else {
    console.info("[Orders] create post-processing", payload);
  }
}
export async function GET(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase server configuration is missing." }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const status = url.searchParams.get("status") ?? "all";
    const paymentStatus = url.searchParams.get("paymentStatus") ?? "all";
    const search = url.searchParams.get("search") ?? "";
    const customerEmail = url.searchParams.get("email") ?? "";
    const deliveryStatus = url.searchParams.get("deliveryStatus") ?? "all";
    const startDate = url.searchParams.get("startDate") ?? "";
    const endDate = url.searchParams.get("endDate") ?? "";
    const productSearch = url.searchParams.get("productSearch") ?? "";
    const skuSearch = url.searchParams.get("skuSearch") ?? "";

    const result = await listUserOrders(supabase, user.id, {
      page,
      pageSize,
      status: status as never,
      paymentStatus: paymentStatus as never,
      search,
      customerEmail,
      deliveryStatus,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      productSearch,
      skuSearch,
    });

    const orders = await Promise.all(result.orders.map(async (order) => ({
      ...order,
      bep20_underpayment_wallet_credit: await getUserBep20UnderpaymentWalletCredit(order.id, user.id),
    })));

    return NextResponse.json({ ...result, orders });
  } catch (error) {
    console.error("[Orders] list failed", getOrderErrorMessage(error, "Order list failed"));
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "Order list failed. Please try again later.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let completedOrder: { requestId: string; orderId: string; orderNo: string | null } | null = null;

  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase server configuration is missing." }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Please sign in before creating an order." }, { status: 401 });
    }

    const sizeError = checkRequestSize(request, 16 * 1024);
    if (sizeError) return sizeError;
    const rateLimit = checkRateLimit("order_create", getUserRateLimitKey(user.id, "order_create"));
    if (!rateLimit.allowed) return rateLimit.response!;

    try {
      await assertUserBusinessAllowed(supabase, user.id, "create_order");
    } catch (guardError) {
      if (isAccountRestrictionError(guardError)) {
        return NextResponse.json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
      }
      throw guardError;
    }

    const body = (await request.json().catch(() => null)) as
      | {
          product_id?: string;
          productId?: string;
          sku_id?: string;
          skuId?: string;
          quantity?: number;
          client_request_id?: string;
          clientRequestId?: string;
          contact_email?: string;
          customer_email?: string;
          customer_name?: string;
          customer_phone?: string;
          shipping_address?: Record<string, unknown> | null;
          customer_note?: string;
          payment_method?: string;
          paymentMethod?: string;
          agreement_version_ids?: AgreementInput[];
          agreements?: AgreementInput[];
        }
      | null;

    if (!body || Object.keys(body).some((key) => !ORDER_CREATE_ALLOWED_KEYS.has(key))) {
      return NextResponse.json({ error: "Invalid order parameters." }, { status: 400 });
    }

    const productId = String(body.product_id ?? body.productId ?? "").trim();
    const skuId = String(body.sku_id ?? body.skuId ?? "").trim() || null;
    const clientRequestId = String(body.client_request_id ?? body.clientRequestId ?? "").trim();
    const quantityValue = Number(body.quantity ?? 1);
    const quantity = Math.floor(quantityValue);
    const customerEmail = body.customer_email?.trim() || body.contact_email?.trim() || user.email || null;
    const customerName = body.customer_name?.trim() || null;
    const customerPhone = body.customer_phone?.trim() || null;
    const customerNote = body.customer_note?.trim() || null;
    const paymentMethod = normalizePaymentMethod(body.payment_method ?? body.paymentMethod ?? "balance");
    const agreementInputs = Array.isArray(body.agreements) ? body.agreements : body.agreement_version_ids;

    if (!productId) {
      return NextResponse.json({ error: "Please select a product." }, { status: 400 });
    }

    if (!Number.isInteger(quantityValue) || quantity <= 0 || quantity > 999) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
    }

    if (!clientRequestId || clientRequestId.length > 120) {
      return NextResponse.json({ error: "Missing valid client request id." }, { status: 400 });
    }

    if (!customerEmail) {
      return NextResponse.json({ error: "Please enter a contact email." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return NextResponse.json({ error: "Invalid contact email format." }, { status: 400 });
    }

    if (!paymentMethod) {
      return NextResponse.json({ error: "Unsupported payment method." }, { status: 400 });
    }

    if (paymentMethod !== "balance" && paymentMethod !== "usdt_bep20") {
      return NextResponse.json({ error: "This payment method is not available yet." }, { status: 400 });
    }

    let verifiedAgreements;
    try {
      verifiedAgreements = await verifyCheckoutAgreements(supabase, agreementInputs);
    } catch (agreementError) {
      return NextResponse.json(
        { error: getOrderErrorMessage(agreementError, "Please confirm current order agreements.") },
        { status: 400 }
      );
    }

    const { count: activeSkuCount, error: skuCountError } = await supabase
      .from("product_skus")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("status", "active");

    if (skuCountError && !/product_skus|does not exist|schema cache|PGRST/i.test(skuCountError.message)) {
      return NextResponse.json(
        { error: getOrderErrorMessage(skuCountError, "SKU information could not be loaded. Please try again later.") },
        { status: 400 }
      );
    }

    if ((activeSkuCount ?? 0) > 0 && !skuId) {
      return NextResponse.json({ error: "Please select a complete product SKU." }, { status: 400 });
    }

    const risk = await evaluateOrderRisk({
      supabase,
      request,
      userId: user.id,
      businessId: clientRequestId,
      requestId: clientRequestId,
      productId,
      skuId,
      quantity,
      riskContext: {
        has_sku: Boolean(skuId),
        has_shipping_address: Boolean(body.shipping_address),
      },
    });

    if (shouldBlockRisk(risk)) {
      return NextResponse.json(
        {
          error: riskResponseMessage(risk),
          code: "ORDER_RISK_BLOCKED",
          risk: {
            level: risk.risk_level,
            score: risk.risk_score,
            action: risk.recommended_action,
            requestId: risk.request_id,
          },
        },
        { status: 403 }
      );
    }

    const orderPayload: Record<string, unknown> = {
      p_product_id: productId,
      p_quantity: quantity,
      p_customer_email: customerEmail,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_note: customerNote,
      p_shipping_address: body.shipping_address ?? null,
      p_payment_method: paymentMethod,
      p_client_request_id: clientRequestId,
    };

    if (skuId) {
      orderPayload.p_sku_id = skuId;
    }

    let { data, error } = await supabase.rpc("create_order_with_item", orderPayload);

    if (error) {
      logCreateOrderRpcError({
        requestId: clientRequestId,
        phase: "extended_signature",
        error,
        paramNames: Object.keys(orderPayload),
      });

      if (isCreateOrderRpcSignatureMismatch(error)) {
        if (skuId) {
          return NextResponse.json(
            {
              error: "Current create_order_with_item RPC does not support SKU parameters. Apply the multi-SKU order migration and retry.",
              code: "ORDER_RPC_SKU_SIGNATURE_UNSUPPORTED",
            },
            { status: 500 }
          );
        }

        const legacyOrderPayload: Record<string, unknown> = {
          p_product_id: productId,
          p_quantity: quantity,
          p_customer_email: customerEmail,
          p_customer_name: customerName,
          p_customer_phone: customerPhone,
          p_customer_note: customerNote,
          p_shipping_address: body.shipping_address ?? null,
        };

        const legacyResult = await supabase.rpc("create_order_with_item", legacyOrderPayload);
        data = legacyResult.data;
        error = legacyResult.error;

        if (error) {
          logCreateOrderRpcError({
            requestId: clientRequestId,
            phase: "legacy_signature",
            error,
            paramNames: LEGACY_CREATE_ORDER_RPC_ARGS,
          });
        }
      }
    }

    if (error) {
      const failure = getCreateOrderRpcFailure(error);
      return NextResponse.json(
        { error: failure.error, code: failure.code },
        { status: failure.status }
      );
    }

    // PostgreSQL TABLE-returning RPCs are represented by PostgREST as an array.
    const created = Array.isArray(data) ? data[0] : data;
    const orderId = String((created as { id?: unknown; order_id?: unknown } | null)?.id ?? (created as { order_id?: unknown } | null)?.order_id ?? "");
    const rpcOrderNo = String((created as { order_no?: unknown } | null)?.order_no ?? "").trim() || null;
    if (!orderId) {
      return NextResponse.json(
        {
          error: "Order creation returned an invalid result. Please contact support with the request id.",
          code: "ORDER_CREATED_RESULT_INVALID",
          request_id: clientRequestId,
          order_no: rpcOrderNo,
        },
        { status: 500 }
      );
    }

    completedOrder = { requestId: clientRequestId, orderId, orderNo: rpcOrderNo };
    logOrderPostProcess({ requestId: clientRequestId, stage: "RPC_COMPLETED", orderId, orderNo: rpcOrderNo });

    // The controlled RPC already persists payment_method. A second user-scoped
    // UPDATE would require a broad orders UPDATE policy and can leave a hidden
    // order behind when RLS rejects the redundant write.
    logOrderPostProcess({ requestId: clientRequestId, stage: "ORDER_READ_STARTED", orderId, orderNo: rpcOrderNo });
    const { data: savedOrder, error: orderReadError } = await supabase
      .from("orders")
      .select("id,order_no,status,payment_status,total_amount,payment_method")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderReadError || !savedOrder) {
      logOrderPostProcess({
        level: "error",
        requestId: clientRequestId,
        stage: "ORDER_READ_FAILED",
        orderId,
        orderNo: rpcOrderNo,
        error: orderReadError ?? new Error("Created order was not returned by the ownership-scoped read"),
      });
      return NextResponse.json(
        {
          error: "Order was created but could not be loaded. Please contact support with the request id.",
          code: "ORDER_CREATED_READ_FAILED",
          request_id: clientRequestId,
          order_no: rpcOrderNo,
        },
        { status: 500 }
      );
    }

    completedOrder.orderNo = String(savedOrder.order_no ?? rpcOrderNo ?? "").trim() || null;
    logOrderPostProcess({
      requestId: clientRequestId,
      stage: "ORDER_READ_COMPLETED",
      orderId,
      orderNo: completedOrder.orderNo,
    });

    let warningCode: "ORDER_AGREEMENT_EVIDENCE_PENDING" | undefined;

    logOrderPostProcess({
      requestId: clientRequestId,
      stage: "AGREEMENT_EVIDENCE_STARTED",
      orderId,
      orderNo: completedOrder.orderNo,
    });
    try {
      await recordOrderAgreementAcceptances({
        orderId,
        user,
        agreements: verifiedAgreements,
        request,
      });
      logOrderPostProcess({
        requestId: clientRequestId,
        stage: "AGREEMENT_EVIDENCE_COMPLETED",
        orderId,
        orderNo: completedOrder.orderNo,
      });
    } catch (agreementError) {
      warningCode = "ORDER_AGREEMENT_EVIDENCE_PENDING";
      logOrderPostProcess({
        level: "warn",
        requestId: clientRequestId,
        stage: "AGREEMENT_EVIDENCE_FAILED",
        orderId,
        orderNo: completedOrder.orderNo,
        error: agreementError,
      });
    }

    if (paymentMethod === "balance") {
      logOrderPostProcess({ requestId: clientRequestId, stage: "BALANCE_PAYMENT_STARTED", orderId, orderNo: completedOrder.orderNo });
      try {
        const paymentResult = await payOrderWithBalance({
          orderId,
          userId: user.id,
          clientRequestId,
        });

        logOrderPostProcess({ requestId: clientRequestId, stage: "BALANCE_PAYMENT_COMPLETED", orderId, orderNo: completedOrder.orderNo });
        logOrderPostProcess({ requestId: clientRequestId, stage: "RESPONSE_BUILD_COMPLETED", orderId, orderNo: completedOrder.orderNo });
        return NextResponse.json({
          request_id: clientRequestId,
          warning_code: warningCode,
          order: {
            ...(created as Record<string, unknown>),
            id: orderId,
            order_no: paymentResult.orderNo ?? (created as Record<string, unknown>).order_no,
            status: paymentResult.status,
            payment_status: paymentResult.paymentStatus,
            payment_method: paymentMethod,
            balance_transaction_no: paymentResult.transactionNo,
            delivery_error: paymentResult.deliveryError,
          },
        });
      } catch (paymentError) {
        logOrderPostProcess({ level: "warn", requestId: clientRequestId, stage: "BALANCE_PAYMENT_FAILED", orderId, orderNo: completedOrder.orderNo, error: paymentError });
        logOrderPostProcess({ requestId: clientRequestId, stage: "RESPONSE_BUILD_COMPLETED", orderId, orderNo: completedOrder.orderNo });
        return NextResponse.json(
          {
            error: getBalancePaymentErrorMessage(paymentError),
            code: "BALANCE_PAYMENT_FAILED",
            request_id: clientRequestId,
            warning_code: warningCode,
            order: { id: orderId, ...(savedOrder as Record<string, unknown>) },
          },
          { status: 402 }
        );
      }
    }

    if (paymentMethod === "usdt_bep20") {
      logOrderPostProcess({ requestId: clientRequestId, stage: "BEP20_SESSION_STARTED", orderId, orderNo: completedOrder.orderNo });
      try {
        const chainPayment = await createBep20PaymentSession(String(savedOrder.order_no), user.id);
        logOrderPostProcess({ requestId: clientRequestId, stage: "BEP20_SESSION_COMPLETED", orderId, orderNo: completedOrder.orderNo });
        logOrderPostProcess({ requestId: clientRequestId, stage: "RESPONSE_BUILD_COMPLETED", orderId, orderNo: completedOrder.orderNo });
        return NextResponse.json({
          request_id: clientRequestId,
          warning_code: warningCode,
          order: { ...(created as Record<string, unknown>), payment_method: paymentMethod },
          chainPayment,
        });
      } catch (chainError) {
        logOrderPostProcess({ level: "warn", requestId: clientRequestId, stage: "BEP20_SESSION_FAILED", orderId, orderNo: completedOrder.orderNo, error: chainError });
        logOrderPostProcess({ requestId: clientRequestId, stage: "RESPONSE_BUILD_COMPLETED", orderId, orderNo: completedOrder.orderNo });
        return NextResponse.json(
          {
            error: getBep20ErrorMessage(chainError),
            code: "BEP20_SESSION_FAILED",
            request_id: clientRequestId,
            warning_code: warningCode,
            order: { id: orderId, ...(savedOrder as Record<string, unknown>) },
          },
          { status: typeof (chainError as { status?: unknown })?.status === "number" ? Number((chainError as { status: number }).status) : 503 }
        );
      }
    }

    logOrderPostProcess({ requestId: clientRequestId, stage: "RESPONSE_BUILD_COMPLETED", orderId, orderNo: completedOrder.orderNo });
    return NextResponse.json({
      request_id: clientRequestId,
      warning_code: warningCode,
      order: { ...(created as Record<string, unknown>), payment_method: paymentMethod },
    });

  } catch (error) {
    if (completedOrder) {
      logOrderPostProcess({
        level: "error",
        requestId: completedOrder.requestId,
        stage: "UNHANDLED_POSTPROCESSING_FAILED",
        orderId: completedOrder.orderId,
        orderNo: completedOrder.orderNo,
        error,
      });
      return NextResponse.json(
        {
          error: "Order was created, but follow-up processing failed. Open your orders before retrying.",
          code: "ORDER_CREATED_POSTPROCESSING_FAILED",
          request_id: completedOrder.requestId,
          order_no: completedOrder.orderNo,
        },
        { status: 500 }
      );
    }
    console.error("[Orders] create failed", getOrderErrorMessage(error, "Order creation failed"));
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "Order creation failed. Please try again later.") },
      { status: 500 }
    );
  }
}

