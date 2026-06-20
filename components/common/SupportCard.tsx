"use client";

/**
 * SupportCard - Contact support card for customer service links
 *
 * Displays contact information for customer support channels:
 * online chat, Telegram, WhatsApp, and Email.
 */

import { Card, CardContent } from "@/components/ui/card";
import { usePublicSettings } from "@/components/settings/SettingsProvider";
import { Headphones } from "lucide-react";

interface SupportCardProps {
  title?: string;
  description?: string;
}

export default function SupportCard({
  title = "联系客服",
  description = "如有任何问题，请通过以下方式联系我们",
}: SupportCardProps) {
  const { settings } = usePublicSettings();
  const contactLines = (settings.support_contact.trim() || "客服暂未开放")
    .split(/\r?\n/)
    .filter(Boolean);

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <div className="space-y-2">
          {contactLines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/40"
            >
              <Headphones className="h-4 w-4 text-primary shrink-0" />
              <div className="text-xs text-muted-foreground">{line}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
