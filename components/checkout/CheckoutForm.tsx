"use client";

/**
 * CheckoutForm - Order form for checkout page
 *
 * Switches between two form layouts based on product type:
 * - Physical (SIM cards): recipient name, phone, shipping address, order note
 * - Digital: contact info, email, account region, order note
 *
 * Does NOT process real payments.
 * Future payment integration location: replace onSubmit with
 * real payment gateway API call (e.g., Stripe, Alipay).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductType } from "@/lib/types";

interface CheckoutFormProps {
  productType: ProductType;
  productName: string;
  onSubmit: (data: Record<string, string>) => void;
}

export default function CheckoutForm({
  productType,
  productName,
  onSubmit,
}: CheckoutFormProps) {
  // Form state
  const [formData, setFormData] = useState({
    recipientName: "",
    phoneNumber: "",
    shippingAddress: "",
    contactInfo: "",
    email: "",
    accountRegion: "",
    orderNote: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {productType === "physical" ? "收货信息" : "联系信息"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{productName}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {productType === "physical" ? (
            <>
              {/* Physical product (SIM card) checkout fields */}
              <div className="space-y-2">
                <Label htmlFor="recipientName" className="text-sm">
                  收货人姓名
                </Label>
                <Input
                  id="recipientName"
                  name="recipientName"
                  value={formData.recipientName}
                  onChange={handleChange}
                  placeholder="请输入收货人姓名"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="text-sm">
                  手机号码
                </Label>
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  placeholder="请输入手机号码"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingAddress" className="text-sm">
                  详细收货地址
                </Label>
                <Textarea
                  id="shippingAddress"
                  name="shippingAddress"
                  value={formData.shippingAddress}
                  onChange={handleChange}
                  placeholder="请输入详细收货地址"
                  required
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              {/* Digital product checkout fields */}
              <div className="space-y-2">
                <Label htmlFor="contactInfo" className="text-sm">
                  联系方式
                </Label>
                <Input
                  id="contactInfo"
                  name="contactInfo"
                  value={formData.contactInfo}
                  onChange={handleChange}
                  placeholder="请输入手机号或其他联系方式"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">
                  邮箱
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="请输入接收邮箱"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountRegion" className="text-sm">
                  账号地区
                </Label>
                <Input
                  id="accountRegion"
                  name="accountRegion"
                  value={formData.accountRegion}
                  onChange={handleChange}
                  placeholder="例如：美国、日本"
                />
              </div>
            </>
          )}

          {/* Order note (shared by both types) */}
          <div className="space-y-2">
            <Label htmlFor="orderNote" className="text-sm">
              订单备注
            </Label>
            <Textarea
              id="orderNote"
              name="orderNote"
              value={formData.orderNote}
              onChange={handleChange}
              placeholder="如有特殊需求请在此备注"
              rows={2}
            />
          </div>

          <Button type="submit" className="w-full">
            提交订单
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
