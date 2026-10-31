/** Public, presentation-only fallback icons shared by route mounts and pending navigation. */
export type StorefrontFallbackCategory = {
  slug: string;
  name: string;
  image?: string;
  icon?: "bot" | "creditCard" | "gift" | "key" | "message" | "phone" | "sparkles" | "wallet";
  aliases?: string[];
};

export const fallbackCategoriesByPath: Record<string, StorefrontFallbackCategory[]> = {
  "/products/sim-cards": [
    { slug: "uk", name: "英国", icon: "phone", aliases: ["giffgaff"] },
    { slug: "us", name: "美国", icon: "phone", aliases: ["ultra-mobile"] },
    { slug: "jp", name: "日本", icon: "phone" },
    { slug: "kr", name: "韩国", icon: "phone" },
  ],
  "/products/gift-cards": [
    { slug: "apple-gift-card", name: "Apple 礼品卡", image: "/assets/apple-gift-card-icon.jpg", aliases: ["apple", "app-store", "itunes"] },
    { slug: "giffgaff", name: "GiffGaff", image: "/assets/giffgaff-icon.svg", aliases: ["giff-gaff"] },
  ],
  "/products/digital-accounts": [
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
  ],
  "/products/ai-membership": [
    { slug: "chatgpt", name: "Chat Gpt", image: "/assets/ai-chatgpt-icon.jpg" },
    { slug: "claude", name: "Claude", image: "/assets/ai-claude-icon.jpg" },
    { slug: "gemini", name: "Gemini", image: "/assets/ai-gemini-icon.jpg", aliases: ["geimini", "google-one"] },
    { slug: "grok", name: "Grok", image: "/assets/ai-grok-icon.jpg" },
  ],
  "/products/sms-code": [
    { slug: "us", name: "美国", icon: "message" },
    { slug: "uk", name: "英国", icon: "message" },
    { slug: "ca", name: "加拿大", icon: "message" },
    { slug: "au", name: "澳大利亚", icon: "message" },
    { slug: "jp", name: "日本", icon: "message" },
    { slug: "sg", name: "新加坡", icon: "message" },
    { slug: "hk", name: "香港", icon: "message" },
  ],
};
