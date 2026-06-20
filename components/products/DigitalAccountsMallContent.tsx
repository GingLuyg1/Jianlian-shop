"use client";

import SupabaseMallContent from "./SupabaseMallContent";

const fallbackCategories = [
  { slug: "apple-id", name: "Apple ID", image: "/assets/apple-id-icon.jpg" },
  { slug: "steam", name: "Steam", image: "/assets/digital-steam.jpg" },
  { slug: "gmail", name: "Gmail 邮箱", image: "/assets/digital-gmail.svg" },
  { slug: "outlook", name: "Outlook 邮箱", image: "/assets/digital-outlook.svg" },
  { slug: "telegram", name: "Telegram", image: "/assets/digital-telegram.svg" },
  { slug: "whatsapp", name: "Whats App", image: "/assets/digital-whatsapp.svg" },
  { slug: "tiktok", name: "Tiktok", image: "/assets/digital-tiktok.svg" },
  { slug: "x", name: "X", image: "/assets/digital-x.svg" },
  { slug: "instagram", name: "instagram", image: "/assets/digital-instagram.svg" },
  { slug: "facebook", name: "Facebook", image: "/assets/digital-facebook.svg" },
  { slug: "youtube", name: "YouTube", image: "/assets/digital-youtube.svg" },
  { slug: "twitch", name: "Twitch", image: "/assets/digital-twitch.svg" },
];

export default function DigitalAccountsMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategories}
      fallbackTitle="数字账号"
      primaryNames={["数字账号"]}
      primarySlugs={["digital-accounts", "digital-account"]}
      productCategory="digital-accounts"
    />
  );
}
