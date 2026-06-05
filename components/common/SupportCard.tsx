/**
 * SupportCard - Contact support card for customer service links
 *
 * Displays contact information for customer support channels:
 * online chat, Telegram, WhatsApp, and Email.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Headphones, Send, MessageCircle, Mail } from "lucide-react";

interface SupportCardProps {
  title?: string;
  description?: string;
}

export default function SupportCard({
  title = "联系客服",
  description = "如有任何问题，请通过以下方式联系我们",
}: SupportCardProps) {
  const contacts = [
    {
      icon: Headphones,
      label: "在线客服",
      value: "7x24小时在线",
      href: "#",
    },
    {
      icon: Send,
      label: "Telegram",
      value: "@jianlian_support",
      href: "#",
    },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      value: "+86 xxx xxxx",
      href: "#",
    },
    {
      icon: Mail,
      label: "Email",
      value: "support@jianlian.shop",
      href: "#",
    },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <div className="space-y-2">
          {contacts.map((contact) => {
            const Icon = contact.icon;
            return (
              <a
                key={contact.label}
                href={contact.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors"
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <div className="text-xs font-medium text-foreground">
                    {contact.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {contact.value}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
