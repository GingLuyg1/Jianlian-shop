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
    { slug: "nz", name: "新西兰", icon: "phone", aliases: ["one-nz", "onenz", "vodafone", "new-zealand"] },
    { slug: "jp", name: "日本", icon: "phone" },
    { slug: "kr", name: "韩国", icon: "phone" },
  ],
  "/products/gift-cards": [
    { slug: "apple-gift-card", name: "Apple 礼品卡", image: "/assets/apple-gift-card-icon.jpg", aliases: ["apple", "app-store", "itunes"] },
    { slug: "steam", name: "Steam 礼品卡", image: "/assets/digital-steam.png", aliases: ["steam-gift-card", "steam 礼品卡"] },
    { slug: "google-play", name: "Google Play 礼品卡", image: "/assets/giftcard-google-play.png", aliases: ["google-play-gift-card", "google play", "google"] },
    { slug: "netflix", name: "Netflix 礼品卡", image: "/assets/giftcard-netflix.png", aliases: ["netflix-gift-card", "netflix 礼品卡"] },
    { slug: "giffgaff", name: "Giffgaff", image: "/assets/giffgaff-icon.svg", aliases: ["giff-gaff"] },
  ],
  "/products/digital-accounts": [
    { slug: "apple-id", name: "Apple ID", image: "/assets/apple-id-icon.jpg" },
    { slug: "steam", name: "Steam", image: "/assets/digital-steam.png" },
    { slug: "gmail", name: "Gmail 邮箱", image: "/assets/digital-gmail.svg" },
    { slug: "outlook", name: "Outlook 邮箱", image: "/assets/digital-outlook.svg" },
    { slug: "telegram", name: "Telegram", image: "/assets/digital-telegram.svg" },
    { slug: "whatsapp", name: "WhatsApp", image: "/assets/digital-whatsapp.svg", aliases: ["whats app"] },
    { slug: "tiktok", name: "TikTok", image: "/assets/digital-tiktok.svg" },
    { slug: "x", name: "X-Twitter", image: "/assets/digital-x.svg", aliases: ["x-twitter", "twitter"] },
    { slug: "instagram", name: "Instagram", image: "/assets/digital-instagram.svg" },
    { slug: "facebook", name: "Facebook", image: "/assets/digital-facebook.svg" },
    { slug: "youtube", name: "YouTube", image: "/assets/digital-youtube.svg" },
    { slug: "twitch", name: "Twitch", image: "/assets/digital-twitch.svg" },
    { slug: "github", name: "GitHub", image: "/assets/digital-github.png", aliases: ["git-hub"] },
    { slug: "linkedin", name: "LinkedIn", image: "/assets/digital-linkedin.png", aliases: ["linked-in"] },
    { slug: "threads", name: "Threads", image: "/assets/digital-threads.png", aliases: ["thread"] },
    { slug: "discord", name: "Discord", image: "/assets/digital-discord.png", aliases: ["dc"] },
  ],
  "/products/ai-membership": [
    { slug: "chatgpt", name: "ChatGPT", image: "/assets/ai-chatgpt-icon.jpg", aliases: ["chat gpt", "chat-gpt"] },
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

const simRegionCodes: Record<string, string> = {
  uk: "UK", gb: "UK", "united-kingdom": "UK", giffgaff: "UK", 英国: "UK",
  us: "US", usa: "US", "united-states": "US", "ultra-mobile": "US", 美国: "US",
  es: "ES", spain: "ES", 西班牙: "ES", hk: "HK", "hong-kong": "HK", 中国香港: "HK", 香港: "HK",
  nz: "NZ", "new-zealand": "NZ", 新西兰: "NZ", jp: "JP", japan: "JP", 日本: "JP",
  kr: "KR", korea: "KR", 韩国: "KR", tw: "TW", 中国台湾: "TW", 台湾: "TW",
  au: "AU", 澳大利亚: "AU", ca: "CA", 加拿大: "CA", sg: "SG", 新加坡: "SG",
  my: "MY", 马来西亚: "MY", th: "TH", 泰国: "TH", de: "DE", 德国: "DE",
  fr: "FR", 法国: "FR", id: "ID", 印度尼西亚: "ID", vn: "VN", 越南: "VN",
};
export function simRegionCode(slug: string, name: string) {
  const normalizedSlug = slug.trim().toLowerCase().replace(/^sim-cards?-/, "");
  const normalizedName = name.trim();
  return simRegionCodes[normalizedSlug] || simRegionCodes[normalizedName]
    || (/^[a-z]{2}$/.test(normalizedSlug) ? normalizedSlug.toUpperCase() : undefined);
}
