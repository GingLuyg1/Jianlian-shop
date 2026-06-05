"use client";

/**
 * FAQ Page - 常见问题
 * Uses PublicLayout. Placeholder page with common questions.
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicLayout from "@/components/layout/PublicLayout";

const faqItems = [
  {
    question: "如何购买商品？",
    answer: "选择需要的商品，点击立即购买，填写订单信息后提交即可。",
  },
  {
    question: "数字商品如何交付？",
    answer: "数字商品购买后，卡密或账号信息将通过邮件或订单详情页面交付。",
  },
  {
    question: "实物商品如何发货？",
    answer: "实物商品（如SIM卡）将通过快递寄送到您填写的收货地址。",
  },
  {
    question: "如何查询订单状态？",
    answer: "点击左侧菜单的订单查询，输入订单号和手机号后四位即可查询。",
  },
  {
    question: "是否支持退款？",
    answer: "数字商品一经发出不支持退款。实物商品如有质量问题，请联系客服处理。",
  },
  {
    question: "本站是否提供中国大陆业务？",
    answer: "本站不提供任何中国大陆业务。网站出售的商品仅限个人或团体合法电商拓客使用。",
  },
  {
    question: "如何联系客服？",
    answer: "您可以通过左侧菜单底部的在线客服、Telegram、WhatsApp或Email联系我们。",
  },
];

export default function FAQPage() {
  return (
    <PublicLayout>
      <h1 className="text-xl font-bold text-foreground mb-4">常见问题</h1>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">常见问题解答</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-sm text-left">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
