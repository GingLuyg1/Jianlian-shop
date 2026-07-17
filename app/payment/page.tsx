"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Copy, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/i18n/money";

type PaymentChannel = {
  code: string;
  channel_code?: string;
  display_name?: string;
  name?: string;
  currency?: string;
  network?: string;
  configured?: boolean;
  enabled?: boolean;
};

type PaymentSession = {
  sessionNo: string;
  status: "pending" | "processing";
  paymentType: "redirect" | "qrcode" | "address";
  paymentUrl?: string;
  qrCodeUrl?: string;
  walletAddress?: string;
  network?: string;
  currency: string;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  expiresAt: string;
};

type PaymentStatus = {
  sessionNo: string;
  status: string;
  paidAt: string | null;
  expiresAt: string | null;
};

type Bep20ChainSession = {
  orderNo: string;
  network: string;
  chainId: number;
  asset: string;
  orderCurrency: string;
  orderAmount: string;
  paymentCurrency: string;
  exchangeRate: string;
  exchangeRateSource: string;
  exchangeRateFetchedAt: string | null;
  exchangeRateExpiresAt: string | null;
  expectedAmount: string;
  receiveAddress: string;
  expiresAt: string;
  status: string;
  submittedTxHash: string | null;
  prefillSubmittedTxHash: boolean;
  requiredConfirmations: number;
  tokenContract: string;
  pricingStatus: string;
  txHash?: string;
  confirmationCount?: number;
  confirmedAmount?: string | null;
  message?: string;
};

function formatMoney(value: number | string | null | undefined, currency = "CNY") {
  return formatCurrency(value, currency);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getStatusText(status: string) {
  if (status === "paid") return "支付成功";
  if (status === "processing") return "支付处理中";
  if (status === "failed") return "支付失败";
  if (status === "expired") return "支付超时";
  if (status === "closed") return "订单关闭";
  return "等待支付";
}

function secondsLeft(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

const QR_VERSION_3_SIZE = 29;
const QR_VERSION_3_L_DATA_CODEWORDS = 55;
const QR_VERSION_3_L_EC_CODEWORDS = 15;

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
}

function createGaloisTables() {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) exp[index] = exp[index - 255];
  return { exp, log };
}

const QR_GF = createGaloisTables();

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) return 0;
  return QR_GF.exp[QR_GF.log[left] + QR_GF.log[right]];
}

function createGeneratorPolynomial(degree: number) {
  let polynomial = [1];
  for (let degreeIndex = 0; degreeIndex < degree; degreeIndex += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= gfMultiply(polynomial[index], QR_GF.exp[degreeIndex]);
    }
    polynomial = next;
  }
  return polynomial;
}

function createErrorCorrection(data: number[], ecLength: number) {
  const generator = createGeneratorPolynomial(ecLength);
  const result = [...data, ...new Array<number>(ecLength).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = result[index];
    if (factor === 0) continue;
    for (let generatorIndex = 0; generatorIndex < generator.length; generatorIndex += 1) {
      result[index + generatorIndex] ^= gfMultiply(generator[generatorIndex], factor);
    }
  }
  return result.slice(data.length);
}

function encodeQrByteData(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > 53) throw new Error("QR_PAYLOAD_TOO_LONG");

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, QR_VERSION_3_L_DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    data.push(bits.slice(index, index + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  for (let padIndex = 0; data.length < QR_VERSION_3_L_DATA_CODEWORDS; padIndex += 1) {
    data.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }
  return [...data, ...createErrorCorrection(data, QR_VERSION_3_L_EC_CODEWORDS)];
}

function createQrMatrixBase() {
  const size = QR_VERSION_3_SIZE;
  const modules: (boolean | null)[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const set = (x: number, y: number, value: boolean, isReserved = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = value;
    if (isReserved) reserved[y][x] = true;
  };
  const addFinder = (x: number, y: number) => {
    for (let yy = -1; yy <= 7; yy += 1) {
      for (let xx = -1; xx <= 7; xx += 1) {
        const px = x + xx;
        const py = y + yy;
        const active =
          xx >= 0 &&
          yy >= 0 &&
          xx <= 6 &&
          yy <= 6 &&
          (xx === 0 || yy === 0 || xx === 6 || yy === 6 || (xx >= 2 && xx <= 4 && yy >= 2 && yy <= 4));
        set(px, py, active);
      }
    }
  };
  const addAlignment = (cx: number, cy: number) => {
    for (let yy = -2; yy <= 2; yy += 1) {
      for (let xx = -2; xx <= 2; xx += 1) {
        const distance = Math.max(Math.abs(xx), Math.abs(yy));
        set(cx + xx, cy + yy, distance === 2 || distance === 0);
      }
    }
  };

  addFinder(0, 0);
  addFinder(size - 7, 0);
  addFinder(0, size - 7);
  addAlignment(22, 22);
  for (let index = 8; index < size - 8; index += 1) {
    set(index, 6, index % 2 === 0);
    set(6, index, index % 2 === 0);
  }
  for (let index = 0; index < 9; index += 1) {
    if (index !== 6) {
      reserved[8][index] = true;
      reserved[index][8] = true;
    }
  }
  for (let index = size - 8; index < size; index += 1) {
    reserved[8][index] = true;
    reserved[index][8] = true;
  }
  set(8, size - 8, true);
  return { modules, reserved };
}

function qrMask(mask: number, x: number, y: number) {
  if (mask === 0) return (x + y) % 2 === 0;
  if (mask === 1) return y % 2 === 0;
  if (mask === 2) return x % 3 === 0;
  if (mask === 3) return (x + y) % 3 === 0;
  if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
  if (mask === 5) return ((x * y) % 2) + ((x * y) % 3) === 0;
  if (mask === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
  return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
}

function createFormatBits(mask: number) {
  let data = (0b01 << 3) | mask; // Error correction level L.
  let bits = data << 10;
  const generator = 0b10100110111;
  for (let index = 14; index >= 10; index -= 1) {
    if (((bits >>> index) & 1) !== 0) bits ^= generator << (index - 10);
  }
  return (((data << 10) | bits) ^ 0b101010000010010) & 0x7fff;
}

function applyFormatBits(modules: boolean[][], mask: number) {
  const size = modules.length;
  const bits = createFormatBits(mask);
  const get = (index: number) => ((bits >>> index) & 1) === 1;
  const primary = [
    [0, 8],
    [1, 8],
    [2, 8],
    [3, 8],
    [4, 8],
    [5, 8],
    [7, 8],
    [8, 8],
    [8, 7],
    [8, 5],
    [8, 4],
    [8, 3],
    [8, 2],
    [8, 1],
    [8, 0],
  ];
  const secondary = [
    [8, size - 1],
    [8, size - 2],
    [8, size - 3],
    [8, size - 4],
    [8, size - 5],
    [8, size - 6],
    [8, size - 7],
    [8, size - 8],
    [size - 7, 8],
    [size - 6, 8],
    [size - 5, 8],
    [size - 4, 8],
    [size - 3, 8],
    [size - 2, 8],
    [size - 1, 8],
  ];
  primary.forEach(([x, y], index) => {
    modules[y][x] = get(index);
  });
  secondary.forEach(([x, y], index) => {
    modules[y][x] = get(index);
  });
}

function placeQrData(codewords: number[], mask: number) {
  const { modules, reserved } = createQrMatrixBase();
  const bits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => ((byte >>> (7 - index)) & 1) === 1));
  let bitIndex = 0;
  let upward = true;
  for (let right = QR_VERSION_3_SIZE - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let rowIndex = 0; rowIndex < QR_VERSION_3_SIZE; rowIndex += 1) {
      const y = upward ? QR_VERSION_3_SIZE - 1 - rowIndex : rowIndex;
      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const x = right - columnOffset;
        if (reserved[y][x]) continue;
        const raw = bits[bitIndex] ?? false;
        modules[y][x] = raw !== qrMask(mask, x, y);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  const finalModules = modules.map((row) => row.map(Boolean));
  applyFormatBits(finalModules, mask);
  return finalModules;
}

function scoreQrMatrix(matrix: boolean[][]) {
  const size = matrix.length;
  let score = 0;
  const scoreRuns = (line: boolean[]) => {
    let runColor = line[0];
    let runLength = 1;
    for (let index = 1; index <= line.length; index += 1) {
      if (line[index] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) score += 3 + (runLength - 5);
        runColor = line[index];
        runLength = 1;
      }
    }
  };
  for (let y = 0; y < size; y += 1) scoreRuns(matrix[y]);
  for (let x = 0; x < size; x += 1) scoreRuns(matrix.map((row) => row[x]));
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) score += 3;
    }
  }
  const dark = matrix.flat().filter(Boolean).length;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

function localQrCells(value: string) {
  const codewords = encodeQrByteData(value);
  const candidates = Array.from({ length: 8 }, (_, mask) => placeQrData(codewords, mask));
  return candidates.reduce((best, current) => (scoreQrMatrix(current) < scoreQrMatrix(best) ? current : best), candidates[0]);
}

function LocalAddressQr({ value }: { value: string }) {
  const cells = useMemo(() => localQrCells(value), [value]);
  const quiet = 4;
  const moduleSize = 6;
  const size = cells.length + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${size * moduleSize} ${size * moduleSize}`}
      role="img"
      aria-label="USDT-BEP20 收款地址本地二维码"
      className="mx-auto h-[180px] w-[180px] rounded-lg bg-white"
    >
      <rect width={size * moduleSize} height={size * moduleSize} fill="#fff" />
      {cells.map((row, y) =>
        row.map((active, x) =>
          active ? (
            <rect
              key={`${x}-${y}`}
              x={(x + quiet) * moduleSize}
              y={(y + quiet) * moduleSize}
              width={moduleSize}
              height={moduleSize}
              fill="#111827"
            />
          ) : null
        )
      )}
    </svg>
  );
}

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("order") || searchParams.get("order_no") || "";
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [bep20Session, setBep20Session] = useState<Bep20ChainSession | null>(null);
  const [txHash, setTxHash] = useState("");
  const [verifyingTx, setVerifyingTx] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState("");
  const [nowTick, setNowTick] = useState(0);
  const pollTimer = useRef<number | null>(null);

  const firstItem = order?.order_items?.[0] ?? null;
  const orderStatus = normalizeOrderStatus(order?.status);
  const normalizedPaymentStatus = normalizePaymentStatus(order?.payment_status);
  const canPay =
    Boolean(order) &&
    normalizedPaymentStatus !== "paid" &&
    orderStatus !== "cancelled" &&
    !["closed", "expired", "failed"].includes(String(order?.status ?? ""));
  const currentStatus = normalizedPaymentStatus === "paid"
    ? "paid"
    : paymentStatus?.status ?? order?.payment_status ?? "unpaid";
  const remainingSeconds = secondsLeft(session?.expiresAt) + nowTick * 0;
  const isBep20Order = order?.payment_method === "usdt_bep20";
  const bep20RemainingSeconds = secondsLeft(bep20Session?.expiresAt) + nowTick * 0;

  const loadOrder = useCallback(async () => {
    if (!orderNo) {
      setError("缺少订单编号");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | { order?: OrderRecord; error?: string }
        | null;

      if (response.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent(`/payment?order=${orderNo}`)}`);
        return;
      }

      if (!response.ok) throw new Error(result?.error ?? "订单读取失败");
      setOrder(result?.order ?? null);
      if (result?.order?.payment_method === "usdt_bep20") setSelectedChannel("usdt_bep20");
    } catch (loadError) {
      setError(getOrderErrorMessage(loadError, "订单读取失败"));
    } finally {
      setLoading(false);
    }
  }, [orderNo, router]);

  const loadChannels = useCallback(async () => {
    try {
      const response = await fetch("/api/recharges/channels", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | { channels?: PaymentChannel[]; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "支付渠道读取失败");
      const enabled = (result?.channels ?? []).filter((channel) => channel.enabled !== false);
      setChannels(enabled);
      setSelectedChannel((current) => current || enabled[0]?.code || enabled[0]?.channel_code || "");
    } catch (channelError) {
      setError(getOrderErrorMessage(channelError, "支付渠道读取失败"));
    }
  }, []);

  useEffect(() => {
    loadOrder();
    loadChannels();
  }, [loadChannels, loadOrder]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedChannelInfo = useMemo(
    () => channels.find((channel) => (channel.code || channel.channel_code) === selectedChannel) ?? null,
    [channels, selectedChannel]
  );

  async function createSession(channelCode = selectedChannel) {
    if (!order || !channelCode || creatingSession) return;
    setCreatingSession(true);
    setError("");
    setSession(null);
    setPaymentStatus(null);
    try {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: "order",
          businessNo: order.order_no,
          channel: channelCode,
        }),
      });
      const result = (await response.json().catch(() => null)) as (PaymentSession & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? "支付会话创建失败");
      setSession(result);
    } catch (sessionError) {
      setError(getOrderErrorMessage(sessionError, "支付会话创建失败"));
    } finally {
      setCreatingSession(false);
    }
  }

  async function loadBep20Session() {
    if (!order?.order_no || creatingSession) return;
    setCreatingSession(true);
    setError("");
    try {
      const response = await fetch("/api/payments/bep20/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: order.order_no }),
      });
      const result = (await response.json().catch(() => null)) as (Bep20ChainSession & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? "USDT-BEP20 支付单创建失败");
      setBep20Session(result);
      setTxHash(result?.prefillSubmittedTxHash ? result.submittedTxHash ?? "" : "");
    } catch (sessionError) {
      setError(getOrderErrorMessage(sessionError, "USDT-BEP20 支付单创建失败"));
    } finally {
      setCreatingSession(false);
    }
  }

  async function verifyBep20TxHash() {
    if (!order?.order_no || verifyingTx) return;
    setVerifyingTx(true);
    setError("");
    try {
      const response = await fetch("/api/payments/bep20/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: order.order_no, tx_hash: txHash }),
      });
      const result = (await response.json().catch(() => null)) as (Bep20ChainSession & { error?: string }) | null;
      if (!response.ok) throw new Error(result?.error ?? "链上交易校验失败");
      setBep20Session(result);
      if (result?.status === "paid") {
        await loadOrder();
        router.push(`/order-success?order=${encodeURIComponent(orderNo)}`);
      }
    } catch (verifyError) {
      setError(getOrderErrorMessage(verifyError, "链上交易校验失败"));
    } finally {
      setVerifyingTx(false);
    }
  }

  async function queryStatus(sessionNo: string) {
    const response = await fetch(`/api/payments/status/${encodeURIComponent(sessionNo)}`, { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as (PaymentStatus & { error?: string }) | null;
    if (!response.ok) throw new Error(result?.error ?? "支付状态查询失败");
    setPaymentStatus(result);
    if (result?.status === "paid") {
      await loadOrder();
      router.push(`/order-success?order=${encodeURIComponent(orderNo)}`);
    }
    return result;
  }

  useEffect(() => {
    if (!session?.sessionNo) return;
    if (pollTimer.current) window.clearTimeout(pollTimer.current);

    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden) {
        pollTimer.current = window.setTimeout(tick, 8000);
        return;
      }

      try {
        const status = await queryStatus(session.sessionNo);
        if (["paid", "failed", "expired", "closed"].includes(String(status?.status))) return;
      } catch {
        // 单次状态查询失败不打断收银台，下一轮继续。
      }
      pollTimer.current = window.setTimeout(tick, 5000);
    };

    pollTimer.current = window.setTimeout(tick, 1000);
    return () => {
      stopped = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionNo]);

  useEffect(() => {
    if (isBep20Order && order?.order_no && !bep20Session && !loading) {
      void loadBep20Session();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBep20Order, order?.order_no, loading]);

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">收银台</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              选择已开放的支付方式，创建真实支付会话后完成付款。
            </p>
          </div>
          {order ? (
            <Button variant="outline" asChild>
              <Link href={`/account/orders/${encodeURIComponent(order.order_no)}`}>返回订单</Link>
            </Button>
          ) : null}
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
                  支付方式
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {isBep20Order ? (
                  <Bep20PaymentPanel
                    session={bep20Session}
                    loading={creatingSession}
                    txHash={txHash}
                    verifying={verifyingTx}
                    remainingSeconds={bep20RemainingSeconds}
                    onCreate={loadBep20Session}
                    onTxHashChange={setTxHash}
                    onVerify={verifyBep20TxHash}
                    onCopy={copyText}
                  />
                ) : !canPay ? (
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm text-muted-foreground">
                    当前订单状态不允许继续付款。
                  </div>
                ) : channels.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    暂无已开放的支付方式，请稍后再试或联系在线客服。
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {channels.map((channel) => {
                        const code = channel.code || channel.channel_code || "";
                        const selected = selectedChannel === code;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              setSelectedChannel(code);
                              setSession(null);
                              setPaymentStatus(null);
                            }}
                            className={cn(
                              "rounded-xl border p-3 text-left text-sm transition-colors",
                              selected ? "border-primary bg-orange-50 text-primary" : "border-border bg-white hover:border-primary/50"
                            )}
                          >
                            <div className="font-medium">{channel.display_name || channel.name || code}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {channel.currency || "CNY"}
                              {channel.network ? ` · ${channel.network}` : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      type="button"
                      disabled={!selectedChannel || creatingSession}
                      onClick={() => createSession()}
                    >
                      {creatingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {session ? "重新获取支付信息" : "创建支付会话"}
                    </Button>
                  </>
                )}

                {session ? (
                  <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">支付状态</span>
                      <Badge variant="outline">{getStatusText(currentStatus)}</Badge>
                    </div>
                    <Info label="支付单号" value={session.sessionNo} copyable onCopy={() => copyText(session.sessionNo)} />
                    <Info label="支付金额" value={formatMoney(session.payableAmount, session.currency)} strong />
                    <Info label="支付币种" value={session.currency} />
                    {session.network ? <Info label="网络" value={session.network} /> : null}
                    <Info label="有效时间" value={formatDate(session.expiresAt)} />
                    <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4" />
                      剩余 {Math.floor(remainingSeconds / 60)} 分 {remainingSeconds % 60} 秒
                    </div>

                    {session.qrCodeUrl ? (
                      <div className="rounded-xl bg-white p-4 text-center">
                        <img src={session.qrCodeUrl} alt="支付二维码" className="mx-auto h-48 w-48 rounded-lg object-contain" />
                      </div>
                    ) : null}

                    {session.walletAddress ? (
                      <Info
                        label="收款地址"
                        value={session.walletAddress}
                        copyable
                        onCopy={() => copyText(session.walletAddress!)}
                      />
                    ) : null}

                    {session.paymentUrl ? (
                      <Button asChild>
                        <a href={session.paymentUrl} target="_blank" rel="noreferrer">
                          打开支付页面
                        </a>
                      </Button>
                    ) : null}

                    {!session.qrCodeUrl && !session.walletAddress && !session.paymentUrl ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        该支付方式暂未返回可展示的支付信息，请更换支付方式或稍后重试。
                      </div>
                    ) : null}

                    <Button variant="outline" onClick={() => session.sessionNo && queryStatus(session.sessionNo)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      刷新支付状态
                    </Button>
                  </div>
                ) : selectedChannelInfo?.configured === false ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    该支付方式暂未开放。
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">订单摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="font-medium text-foreground">{firstItem?.product_name ?? "订单商品"}</div>
                {firstItem?.sku_title ? <Info label="规格" value={firstItem.sku_title} /> : null}
                <Info label="订单编号" value={order.order_no} copyable onCopy={() => copyText(order.order_no)} />
                <Info label="数量" value={String(firstItem?.quantity ?? 1)} />
                <Info label="应付金额" value={formatMoney(order.total_amount, order.currency)} strong />
                <Info label="创建时间" value={formatDate(order.created_at)} />
                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-muted-foreground">订单状态</span>
                  <Badge variant="outline" className={cn("text-xs", ORDER_STATUS_STYLES[orderStatus])}>
                    {getOrderStatusLabel(order.status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">支付状态</span>
                  <Badge variant="outline" className={cn("text-xs", PAYMENT_STATUS_STYLES[normalizedPaymentStatus])}>
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

function Bep20PaymentPanel({
  session,
  loading,
  txHash,
  verifying,
  remainingSeconds,
  onCreate,
  onTxHashChange,
  onVerify,
  onCopy,
}: {
  session: Bep20ChainSession | null;
  loading: boolean;
  txHash: string;
  verifying: boolean;
  remainingSeconds: number;
  onCreate: () => void;
  onTxHashChange: (value: string) => void;
  onVerify: () => void;
  onCopy: (value: string) => void;
}) {
  const txHashValid = /^0x[0-9a-fA-F]{64}$/.test(txHash.trim());

  if (!session) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="font-semibold">USDT-BEP20 支付暂未准备好</div>
        <p>请先创建链上支付单。未配置 BSC RPC 或收款地址时不会生成假地址。</p>
        <Button type="button" onClick={onCreate} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          创建 USDT-BEP20 支付单
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        <div className="font-semibold">仅支持 USDT 通过 BNB Smart Chain（BEP20）转账。</div>
        <div>请勿通过 ERC20、TRC20、opBNB 或其他网络转账。转错网络或错误代币可能无法自动处理。</div>
      </div>

      <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
        <div className="rounded-xl bg-white p-3 text-center">
          <LocalAddressQr value={session.receiveAddress} />
          <div className="mt-2 text-xs text-muted-foreground">本地生成，仅包含公开收款地址</div>
        </div>
        <div className="space-y-3">
          <Info label="支付网络" value={session.network} />
          <Info label="Chain ID" value={String(session.chainId)} />
          <Info label="支付币种" value={session.asset} />
          <Info label="订单金额" value={`${session.orderAmount} ${session.orderCurrency}`} />
          <Info label="USDT 汇率" value={`${session.exchangeRate} (${session.exchangeRateSource})`} />
          <Info label="汇率有效期" value={formatDate(session.exchangeRateExpiresAt)} />
          <Info label="应付金额" value={session.expectedAmount} strong copyable onCopy={() => onCopy(session.expectedAmount)} />
          <Info label="收款地址" value={session.receiveAddress} copyable onCopy={() => onCopy(session.receiveAddress)} />
          <Info label="截止时间" value={formatDate(session.expiresAt)} />
          <Info label="确认数要求" value={`${session.requiredConfirmations} 个区块确认`} />
          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            剩余 {Math.floor(remainingSeconds / 60)} 分 {remainingSeconds % 60} 秒
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">交易哈希 TxHash</label>
        <input
          value={txHash}
          onChange={(event) => onTxHashChange(event.target.value)}
          placeholder="0x 开头的 32 字节交易哈希"
          className="h-11 w-full rounded-lg border border-border bg-white px-3 font-mono text-sm outline-none focus:border-primary"
        />
        {txHash && !txHashValid ? <div className="text-xs text-red-600">请输入合法的 0x 开头 64 位十六进制 TxHash。</div> : null}
      </div>

      {session.message ? (
        <div className="rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground">{session.message}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onVerify} disabled={!txHashValid || verifying || session.status === "paid" || session.status === "expired"}>
          {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          提交链上校验
        </Button>
        <Button type="button" variant="outline" onClick={onCreate} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新支付单
        </Button>
        <Badge variant="outline">{session.status}</Badge>
      </div>
    </div>
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
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {copyable ? (
        <button type="button" onClick={onCopy} className="inline-flex min-w-0 items-center gap-1 truncate font-mono font-medium text-foreground">
          <span className="truncate">{value}</span>
          <Copy className="h-3.5 w-3.5 shrink-0" />
        </button>
      ) : (
        <span className={cn("min-w-0 truncate text-right", strong && "font-semibold text-primary")}>{value}</span>
      )}
    </div>
  );
}
