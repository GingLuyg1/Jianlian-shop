/**
 * CategoryCard - Quick category shortcut card with icon and label
 *
 * Used on the homepage to display the 6 main product categories
 * as clickable cards that navigate to category pages.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Category } from "@/lib/types";
import {
  Phone,
  CreditCard,
  Gift,
  KeyRound,
  Sparkles,
  Wallet,
  LucideIcon,
} from "lucide-react";

// Map icon name strings to actual Lucide components
const iconMap: Record<string, LucideIcon> = {
  Phone,
  CreditCard,
  Gift,
  KeyRound,
  Sparkles,
  Wallet,
};

interface CategoryCardProps {
  category: Category;
}

export default function CategoryCard({ category }: CategoryCardProps) {
  const Icon = iconMap[category.icon] || Phone;

  return (
    <Link href={category.href} className="block transition-all duration-150 hover:scale-[1.015] active:scale-[1.03]">
      <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer border-border">
        <CardContent className="p-4 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-sm text-foreground">
              {category.name}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {category.description}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
