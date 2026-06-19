"use client";

import SupabaseMallContent from "./SupabaseMallContent";

const fallbackCategories = [
  { slug: "chatgpt", name: "Chat Gpt", image: "/assets/ai-chatgpt-icon.jpg" },
  { slug: "claude", name: "Claude", image: "/assets/ai-claude-icon.jpg" },
  {
    slug: "gemini",
    name: "Gemini",
    image: "/assets/ai-gemini-icon.jpg",
    aliases: ["geimini", "google-one"],
  },
  { slug: "grok", name: "Grok", image: "/assets/ai-grok-icon.jpg" },
];

export default function AiMembershipMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategories}
      fallbackTitle="AI 会员充值"
      primaryNames={["AI", "会员充值", "AI 会员充值"]}
      primarySlugs={["ai-membership", "ai-member", "ai-recharge"]}
      productCategory="ai-membership"
    />
  );
}
