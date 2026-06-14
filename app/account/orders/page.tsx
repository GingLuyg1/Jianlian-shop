"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PublicLayout from "@/components/layout/PublicLayout";
import OrderStatusCard from "@/components/orders/OrderStatusCard";
import OrderTable from "@/components/orders/OrderTable";
import { orders } from "@/lib/mock-data";
import { Order } from "@/lib/types";

const ORDERS_PER_PAGE = 6;

export default function MyOrdersPage() {
  const searchParams = useSearchParams();
  const prefillOrderNo = searchParams.get("id") || "";
  const [tab, setTab] = useState("all");
  const [orderNo, setOrderNo] = useState(prefillOrderNo);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [localOrders, setLocalOrders] = useState<Order[]>([]);
  const [foundOrder, setFoundOrder] = useState<Order | null>(null);
  const [searched, setSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    try {
      const savedOrders = JSON.parse(
        localStorage.getItem("jianlian_mock_orders") || "[]"
      );
      if (Array.isArray(savedOrders)) {
        setLocalOrders(savedOrders);
      }
    } catch {
      setLocalOrders([]);
    }
  }, []);

  const allOrders = useMemo(
    () => [...localOrders, ...orders],
    [localOrders]
  );

  useEffect(() => {
    if (!prefillOrderNo || allOrders.length === 0) return;

    const order = allOrders.find((item) => item.orderNo === prefillOrderNo);
    setFoundOrder(order || null);
    setSearched(true);
  }, [allOrders, prefillOrderNo]);

  const filteredOrders = useMemo(() => {
    if (tab === "all") return allOrders;
    if (tab === "pending") {
      return allOrders.filter((order) => order.paymentStatus === "pending");
    }
    if (tab === "processing") {
      return allOrders.filter(
        (order) => order.processingStatus === "processing"
      );
    }
    if (tab === "completed") {
      return allOrders.filter(
        (order) => order.processingStatus === "completed"
      );
    }
    return allOrders;
  }, [allOrders, tab]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const pageOrders = useMemo(() => {
    const start = (currentPage - 1) * ORDERS_PER_PAGE;
    return filteredOrders.slice(start, start + ORDERS_PER_PAGE);
  }, [currentPage, filteredOrders]);
  const pageStart = filteredOrders.length
    ? (currentPage - 1) * ORDERS_PER_PAGE + 1
    : 0;
  const pageEnd = Math.min(currentPage * ORDERS_PER_PAGE, filteredOrders.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [tab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearched(true);
    const order = allOrders.find((item) => item.orderNo === orderNo.trim());
    setFoundOrder(order || null);
  };

  return (
    <PublicLayout contentClassName="max-w-none overflow-hidden px-4 py-3 md:px-6">
      <div className="mx-auto grid h-[calc(100dvh-87px)] max-w-[1500px] grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl">我的订单</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  查看订单记录，也可以在右侧输入订单号快速查询。
                </p>
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="h-9 rounded-full bg-primary/5 p-1">
                  <TabsTrigger value="all" className="h-7 rounded-full text-xs">
                    全部
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending"
                    className="h-7 rounded-full text-xs"
                  >
                    待付款
                  </TabsTrigger>
                  <TabsTrigger
                    value="processing"
                    className="h-7 rounded-full text-xs"
                  >
                    处理中
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="h-7 rounded-full text-xs"
                  >
                    已完成
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OrderTable orders={pageOrders} />
            </div>
            <OrderPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={filteredOrders.length}
              pageStart={pageStart}
              pageEnd={pageEnd}
              onPageChange={setCurrentPage}
            />
          </CardContent>
        </Card>

        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
          <Card className="shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" />
                订单查询
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="orderNo" className="text-sm">
                    订单号
                  </Label>
                  <Input
                    id="orderNo"
                    value={orderNo}
                    onChange={(event) => setOrderNo(event.target.value)}
                    placeholder="请输入订单号"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phoneLast4" className="text-sm">
                    手机号后四位
                  </Label>
                  <Input
                    id="phoneLast4"
                    value={phoneLast4}
                    onChange={(event) => setPhoneLast4(event.target.value)}
                    placeholder="选填"
                    maxLength={4}
                  />
                </div>
                <Button type="submit" className="w-full">
                  查询订单
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="min-h-0 overflow-y-auto">
            {searched ? (
              foundOrder ? (
                <OrderStatusCard order={foundOrder} />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    未找到该订单，请检查订单号是否正确。
                  </CardContent>
                </Card>
              )
            ) : (
              <Card className="h-full">
                <CardContent className="flex h-full items-center justify-center p-6 text-center text-sm leading-6 text-muted-foreground">
                  输入订单号后可查看付款状态、处理进度和发货备注。
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

function OrderPagination({
  currentPage,
  totalPages,
  totalCount,
  pageStart,
  pageEnd,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
}) {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const jumpToPage = () => {
    const nextPage = Number(pageInput);
    if (!Number.isFinite(nextPage)) {
      setPageInput(String(currentPage));
      return;
    }
    onPageChange(Math.min(totalPages, Math.max(1, Math.trunc(nextPage))));
  };

  return (
    <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-border pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        共 {totalCount} 条订单
        {totalCount > 0 ? `，当前 ${pageStart}-${pageEnd} 条` : ""}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-md px-2"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((page) => (
          <Button
            key={page}
            type="button"
            variant={page === currentPage ? "default" : "secondary"}
            size="sm"
            className="h-8 min-w-8 rounded-md px-3"
            onClick={() => onPageChange(page)}
          >
            {page}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-md px-2"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2">前往</span>
        <Input
          value={pageInput}
          inputMode="numeric"
          onChange={(event) =>
            setPageInput(event.target.value.replace(/\D/g, ""))
          }
          onBlur={jumpToPage}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              jumpToPage();
            }
          }}
          className="h-8 w-14 rounded-full bg-slate-50 px-3 text-center"
        />
        <span>页</span>
      </div>
    </div>
  );
}
