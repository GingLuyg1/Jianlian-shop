"use client";

import SupabaseMallContent from "./SupabaseMallContent";

const fallbackCategories = [
  {
    slug: "apple-gift-card",
    name: "Apple 礼品卡",
    image: "/assets/apple-gift-card-icon.jpg",
    aliases: ["apple", "app-store", "itunes"],
  },
  {
    slug: "giffgaff",
    name: "GiffGaff",
    image: "/assets/giffgaff-icon.svg",
    aliases: ["giff-gaff"],
  },
];

export default function GiftCardsMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategories}
      fallbackTitle="礼品卡 / 充值卡"
      primaryNames={["礼品卡", "充值卡"]}
      primarySlugs={["gift-cards", "gift-card", "recharge-card"]}
      productCategory="gift-cards"
    />
  );
}
