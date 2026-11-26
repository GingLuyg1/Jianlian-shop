import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getPersonalCatalogManager } from "@/lib/providers/bitrefill/catalog-server";
import type { CatalogProduct } from "@/lib/providers/bitrefill/catalog-management.mjs";
import { createBitrefillMcpReadonlyClient } from "@/lib/providers/bitrefill/mcp-readonly-client.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function readonlyMcp() {
  const apiKey = process.env.BITREFILL_API_KEY;
  if ((process.env.BITREFILL_AUTH_MODE && process.env.BITREFILL_AUTH_MODE !== "personal") || !apiKey) {
    throw new Error("BITREFILL_READONLY_BALANCE_NOT_CONFIGURED");
  }
  return createBitrefillMcpReadonlyClient({
    credentials: { authMode: "personal", apiKey },
    fetchImpl: fetch,
  });
}

let dailyRateCache: { dateKey: string; rate: number } | null = null;
function getDailyUsdtCnyRate(): number {
  const dateKey = new Date().toISOString().slice(0, 10);
  if (dailyRateCache && dailyRateCache.dateKey === dateKey) {
    return dailyRateCache.rate;
  }
  const raw = Number(process.env.CNY_USDT_FIXED_RATE ?? 7.2);
  const rate = Number.isFinite(raw) && raw > 0 ? raw : 7.2;
  dailyRateCache = { dateKey, rate };
  return rate;
}

const COUNTRY_ZH: Record<string, string> = {
  US: "美国",
  GB: "英国",
  UK: "英国",
  HK: "中国香港",
  JP: "日本",
  SG: "新加坡",
  DE: "德国",
  CA: "加拿大",
  FR: "法国",
  AU: "澳大利亚",
  ES: "西班牙",
  IT: "意大利",
  KR: "韩国",
  TW: "中国台湾",
  TR: "土耳其",
  IN: "印度",
  BR: "巴西",
  MX: "墨西哥",
  ID: "印度尼西亚",
  NL: "荷兰",
  AE: "阿联酋",
  SA: "沙特阿拉伯",
  NZ: "新西兰",
  CH: "瑞士",
  PL: "波兰",
  AT: "奥地利",
  BE: "比利时",
  IE: "爱尔兰",
  PT: "葡萄牙",
  DK: "丹麦",
  NO: "挪威",
  SE: "瑞典",
  FI: "芬兰",
  CN: "中国大陆",
  EG: "埃及",
};

const BRAND_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bgiff\s*gaff\b/i, "Giffgaff 英国话费充值卡 (PIN码)"],
  [/\bsteam\b/i, "Steam 游戏钱包充值卡"],
  [/\bapple\b(?!\s*bee)/i, "Apple 苹果礼品卡 / App Store"],
  [/\bapplebee'?s\b/i, "Applebee's 连锁西餐礼品卡"],
  [/\bgoogle\s*play\b/i, "Google Play 谷歌应用商店礼品卡"],
  [/\bnetflix\b/i, "Netflix 奈飞流媒体会员充值卡"],
  [/\bspotify\b/i, "Spotify 音乐会员充值卡"],
  [/\bplaystation\b|\bpsn\b/i, "PlayStation (PSN) 游戏充值卡"],
  [/\bxbox\b/i, "Xbox 微软游戏充值卡 / 会员"],
  [/\bnintendo\b/i, "Nintendo 任天堂 eShop 充值卡"],
  [/\broblox\b/i, "Roblox 游戏充值卡"],
  [/\bamazon\b/i, "Amazon 亚马逊购物礼品卡"],
  [/\bebay\b/i, "eBay 购物礼品卡"],
  [/\bwalmart\b/i, "Walmart 沃尔玛超市礼品卡"],
  [/\btarget\b/i, "Target 塔吉特百货礼品卡"],
  [/\bbest\s*buy\b/i, "Best Buy 百思买电器礼品卡"],
  [/\bhome\s*depot\b/i, "Home Depot 家得宝建材家居卡"],
  [/\blowe'?s\b/i, "Lowe's 劳氏家居礼品卡"],
  [/\bpottery\s*barn\b/i, "Pottery Barn 高端家居礼品卡"],
  [/\bmark\s*(?:&|and)\s*graham\b/i, "Mark & Graham 定制箱包礼品卡"],
  [/\bfoot\s*locker\b/i, "Foot Locker 运动球鞋服饰礼品卡"],
  [/\bhot\s*topic\b/i, "Hot Topic 潮流服饰周边礼品卡"],
  [/\bl\.?l\.?\s*bean\b/i, "L.L. Bean 户外服饰装备礼品卡"],
  [/\bmacys\b|\bmacy'?s\b/i, "Macy's 梅西百货礼品卡"],
  [/\bnordstrom\b/i, "Nordstrom 诺德斯特龙百货卡"],
  [/\bsephora\b/i, "Sephora 丝芙兰美妆礼品卡"],
  [/\bulta\b/i, "Ulta Beauty 美妆护肤礼品卡"],
  [/\bnike\b/i, "Nike 耐克运动服饰礼品卡"],
  [/\badidas\b/i, "Adidas 阿迪达斯运动礼品卡"],
  [/\buber\s*eats\b/i, "Uber Eats 优步外卖代金券"],
  [/\buber\b/i, "Uber 优步打车出行代金券"],
  [/\blyft\b/i, "Lyft 打车出行礼品卡"],
  [/\bdoordash\b/i, "DoorDash 外卖送餐礼品卡"],
  [/\binstacart\b/i, "Instacart 生鲜杂货配送礼品卡"],
  [/\bgrubhub\b/i, "Grubhub 外卖点餐礼品卡"],
  [/\bstarbucks\b/i, "Starbucks 星巴克咖啡礼品卡"],
  [/\bdomino'?s\b/i, "Domino's 达美乐披萨礼品卡"],
  [/\bpapa\s*john'?s\b/i, "Papa John's 棒约翰披萨礼品卡"],
  [/\bpizza\s*hut\b/i, "Pizza Hut 必胜客餐饮礼品卡"],
  [/\bburger\s*king\b/i, "Burger King 汉堡王餐饮礼品卡"],
  [/\btaco\s*bell\b/i, "Taco Bell 塔可钟快餐礼品卡"],
  [/\bchipotle\b/i, "Chipotle 墨西哥风味快餐卡"],
  [/\bpanera\b/i, "Panera Bread 烘焙轻食礼品卡"],
  [/\bcheesecake\s*factory\b/i, "The Cheesecake Factory 芝士蛋糕工厂餐饮卡"],
  [/\btexas\s*roadhouse\b/i, "Texas Roadhouse 德州牛排馆餐饮卡"],
  [/\boutback\b/i, "Outback 澳拜客牛排馆餐饮卡"],
  [/\bred\s*lobster\b/i, "Red Lobster 红龙虾海鲜餐厅礼品卡"],
  [/\bolive\s*garden\b/i, "Olive Garden 橄榄园意式餐厅卡"],
  [/\bt-rex\s*cafe\b/i, "T-Rex Cafe 恐龙主题餐厅礼品卡"],
  [/\bblue\s*fin\s*seafood\b/i, "Blue Fin 海鲜餐厅礼品卡"],
  [/\bbrenner'?s\s*steakhouse\b/i, "Brenner's 牛排馆餐饮礼品卡"],
  [/\bthe\s*boathouse\b/i, "The Boathouse 湖畔海鲜牛排餐厅卡"],
  [/\bbr\s*guest\b/i, "BR Guest 餐饮集团通用礼品卡"],
  [/\bgoodcents\b/i, "Goodcents 潜艇堡快餐礼品卡"],
  [/\bspafinder\b/i, "SpaFinder 水疗养生美容通用礼品卡"],
  [/\bairbnb\b/i, "Airbnb 爱彼迎民宿酒店预订礼品卡"],
  [/\bhotels\.com\b/i, "Hotels.com 好订网酒店礼品卡"],
  [/\bdelta\s*air\b/i, "Delta 达美航空机票礼品卡"],
  [/\bsouthwest\s*air\b/i, "Southwest 西南航空机票礼品卡"],
  [/\bat&t\b|\batt\b/i, "AT&T 运营商预付话费充值"],
  [/\bt-mobile\b/i, "T-Mobile 运营商预付话费充值"],
  [/\bverizon\b/i, "Verizon 运营商预付话费充值"],
  [/\bcricket\b/i, "Cricket 预付话费充值"],
  [/\bh2o\b/i, "H2O Wireless 预付话费/流量充值"],
  [/\bgosmart\b/i, "GoSmart Mobile 预付话费充值"],
  [/\bsin\s*pin\b/i, "Sin Pin 国际长途电话充值卡"],
  [/\bultra\s*mobile\b/i, "Ultra Mobile 预付话费充值"],
  [/\blycamobile\b|\blyca\b/i, "Lycamobile 莱卡移动话费充值"],
  [/\bboost\s*mobile\b/i, "Boost Mobile 预付话费充值"],
  [/\bmetro\s*by\s*t-mobile\b|\bmetropcs\b/i, "Metro 预付话费充值"],
  [/\btracfone\b/i, "Tracfone 预付话费充值"],
  [/\bsimple\s*mobile\b/i, "Simple Mobile 预付话费充值"],
  [/\bnet10\b/i, "NET10 Wireless 预付话费充值"],
  [/\btotal\s*by\s*verizon\b|\btotal\s*wireless\b/i, "Total Wireless 预付话费充值"],
  [/\bpage\s*plus\b/i, "Page Plus 预付话费充值"],
  [/\bvodafone\b/i, "Vodafone 沃达丰话费充值卡"],
  [/\bo2\b/i, "O2 英国移动话费充值卡"],
  [/\bthree\b|\b3\s*uk\b/i, "Three (3 UK) 移动话费充值卡"],
  [/\bee\b\s*(?:uk|top|pin|mobile)?/i, "EE 英国移动话费充值卡"],
  [/\blebara\b/i, "Lebara 移动话费充值卡"],
  [/\btESCO\s*mobile\b/i, "Tesco Mobile 乐购移动话费充值"],
];

function translateBitrefillProductTitle(name: string, id: string, countryCode?: string): string {
  const cName = COUNTRY_ZH[String(countryCode ?? "").toUpperCase()]
    ?? (/\bUSA\b|\bUS\b/i.test(name) ? "美国" : /\bUK\b|United Kingdom/i.test(name) ? "英国" : "");
  const prefix = cName ? `【${cName}】` : "";

  for (const [regex, zhDesc] of BRAND_TRANSLATIONS) {
    if (regex.test(name) || regex.test(id)) {
      if (zhDesc.startsWith(cName)) return `【${cName}】${zhDesc.slice(cName.length).trim()}`;
      return `${prefix}${zhDesc}`;
    }
  }

  const lower = `${name} ${id}`.toLowerCase();
  if (/paygo|top[-\s]?up|refill|prepaid|wireless|mobile|cellular|telecom|phone|sim|pin\s*less/.test(lower)) {
    return `${prefix}${name.replace(/\b(USA|UK|United Kingdom)\b/gi, "").trim()} 通信话费充值`;
  }
  if (/steakhouse|restaurant|cafe|bistro|grill|pizza|subs|seafood|dining|kitchen|bar|food|deli|bakery/.test(lower)) {
    return `${prefix}${name.replace(/\b(USA|UK|United Kingdom)\b/gi, "").trim()} 餐饮美食礼品卡`;
  }
  if (/hotel|air|flight|travel|resort|cruise|car\s*rental/.test(lower)) {
    return `${prefix}${name.replace(/\b(USA|UK|United Kingdom)\b/gi, "").trim()} 旅行出行礼品卡`;
  }
  if (/game|gaming|play|coin|pubg|free\s*fire|razer|riot|valorant|fortnite|blizzard/.test(lower)) {
    return `${prefix}${name.replace(/\b(USA|UK|United Kingdom)\b/gi, "").trim()} 游戏娱乐充值卡`;
  }
  return `${prefix}${name.replace(/\b(USA|UK|United Kingdom)\b/gi, "").trim()} 官方数字礼品卡`;
}

let cachedSatsPerUsd = 1547;
function calibrateSatsPerUsd(products: CatalogProduct[]): number {
  const ratios: number[] = [];
  for (const p of products) {
    if (p.currency !== "USD") continue;
    for (const pkg of p.packages) {
      const fv = Number(pkg.faceValue);
      const cp = Number(pkg.catalogPrice);
      if (Number.isFinite(fv) && fv > 0 && Number.isFinite(cp) && cp > 100) {
        const r = cp / fv;
        if (r > 500 && r < 5000) ratios.push(r);
      }
    }
  }
  if (ratios.length > 0) {
    ratios.sort((a, b) => a - b);
    cachedSatsPerUsd = ratios[Math.floor(ratios.length / 2)];
  }
  return cachedSatsPerUsd;
}

function computePackageUsdPrice(
  productCurrency: string,
  faceValue: string | number | null | undefined,
  catalogPriceSats: number | null | undefined,
  satsPerUsd: number
): number {
  const cp = Number(catalogPriceSats);
  const fv = Number(faceValue);
  // In Bitrefill /v2/products, catalogPrice is in Satoshis (BTC 10^-8).
  // Converting catalogPrice / satsPerUsd yields the exact USD display price (including operator/service fees).
  if (Number.isFinite(cp) && cp > 100 && satsPerUsd > 0) {
    return Math.round((cp / satsPerUsd) * 100) / 100;
  }
  if (productCurrency === "USD" && Number.isFinite(fv) && fv > 0) {
    return Math.round(fv * 100) / 100;
  }
  if (Number.isFinite(cp) && cp > 0 && cp <= 100) {
    return Math.round(cp * 100) / 100;
  }
  if (Number.isFinite(fv) && fv > 0) {
    return Math.round(fv * 100) / 100;
  }
  return 0;
}

function mapProduct(product: CatalogProduct, satsPerUsd: number, usdtCnyRate: number) {
  const first = product.packages[0];
  const usdAmount = computePackageUsdPrice(product.currency, first?.faceValue, first?.catalogPrice, satsPerUsd);
  const cnyAmount = Math.round(usdAmount * usdtCnyRate * 100) / 100;
  const faceLabel = first?.valueLabel || (first?.faceValue !== null && first?.faceValue !== undefined ? `${product.currency} ${first.faceValue}` : null);
  return {
    id: product.id,
    title: product.name,
    titleZh: translateBitrefillProductTitle(product.name, product.id, product.country),
    faceLabel,
    faceCurrency: product.currency,
    price: usdAmount.toFixed(2),
    priceUsd: usdAmount.toFixed(2),
    priceCny: cnyAmount.toFixed(2),
    usdtCnyRate,
    currency: "USD",
    stock: product.available ? 1 : 0,
    sales: 0,
    isAuto: false,
    sortId: product.country ?? null,
    packagesCount: product.packages.length,
  };
}

function safeCode(error: unknown) {
  const raw = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : error instanceof Error
      ? error.message
      : "";
  return /^BITREFILL_[A-Z0-9_]{1,90}$/.test(raw) || /^[A-Z][A-Z0-9_]{1,89}$/.test(raw)
    ? raw
    : "BITREFILL_READONLY_UNAVAILABLE";
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    return json({ error: admin.message, code: "BITREFILL_ADMIN_REQUIRED", requestId }, admin.status);
  }

  try {
    const params = new URL(request.url).searchParams;
    const resource = params.get("resource") ?? "balance";
    const usdtCnyRate = getDailyUsdtCnyRate();

    if (resource === "balance") {
      const result = await readonlyMcp().readBalances();
      const wallet = result.balances.find((entry: { paymentMethod: string; currency: string }) =>
        entry.paymentMethod === "balance" && entry.currency === "USD")
        ?? result.balances.find((entry: { paymentMethod: string }) => entry.paymentMethod === "balance");
      if (!wallet) throw new Error("BITREFILL_BALANCE_WALLET_MISSING");
      return json({
        supplier: "Bitrefill",
        balance: {
          balance: wallet.availableAmount,
          name: "Bitrefill",
          totalSpent: null,
          totalOrders: null,
          currency: wallet.currency,
          usdtCnyRate,
        },
        purchaseEnabled: false,
        requestId,
      });
    }

    const manager = getPersonalCatalogManager();

    if (resource === "products") {
      const q = params.get("q")?.trim() ?? "";
      const rawCountry = (params.get("country")?.trim() || "US").toUpperCase();
      const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : "US";
      if (q.length > 100 || /[\u0000-\u001f<>]/u.test(q)) {
        return json({ error: "搜索关键词无效", code: "BITREFILL_CATALOG_QUERY_INVALID", requestId }, 400);
      }

      // Fetch first page (populates in-memory country snapshot), then read all remaining pages from cache
      const firstPage = await manager.list({ country, q, page: 1, pageSize: 50 });
      const allProducts: CatalogProduct[] = [...firstPage.products];
      const totalPages = Math.min(20, Math.ceil(firstPage.total / 50));
      for (let page = 2; page <= totalPages; page += 1) {
        const next = await manager.list({ country, q, page, pageSize: 50 });
        allProducts.push(...next.products);
      }

      const satsPerUsd = calibrateSatsPerUsd(allProducts);

      return json({
        supplier: "Bitrefill",
        country,
        usdtCnyRate,
        total: firstPage.total,
        products: allProducts.map((item) => mapProduct(item, satsPerUsd, usdtCnyRate)),
        complete: !firstPage.truncated,
        purchaseEnabled: false,
        requestId,
      });
    }

    if (resource === "product") {
      const id = params.get("id")?.trim() ?? "";
      const result = await manager.detail(id);
      const satsPerUsd = calibrateSatsPerUsd([result.product]);

      // Also attempt MCP USD detail read for authoritative displayPriceUsd per package
      const mcpUsdByFaceValue = new Map<string, number>();
      try {
        const mcpDetail = await readonlyMcp().readProductDetails(id);
        for (const pkg of mcpDetail.packages ?? []) {
          const usd = Number(pkg.displayPriceUsd);
          if (Number.isFinite(usd) && usd > 0) {
            mcpUsdByFaceValue.set(String(pkg.packageValue), usd);
          }
        }
      } catch {
        // Fallback to calibrated satoshi-to-USD conversion if MCP detail is unavailable
      }

      const mapped = mapProduct(result.product, satsPerUsd, usdtCnyRate);
      const skuVariants = result.product.packages.map((entry) => {
        const fvKey = entry.faceValue !== null && entry.faceValue !== undefined ? String(entry.faceValue) : "";
        const usdPrice = mcpUsdByFaceValue.get(fvKey)
          ?? computePackageUsdPrice(result.product.currency, entry.faceValue, entry.catalogPrice, satsPerUsd);
        const cnyPrice = Math.round(usdPrice * usdtCnyRate * 100) / 100;
        const faceTitle = entry.valueLabel || (entry.faceValue !== null ? `${result.product.currency} ${entry.faceValue}` : entry.packageId);
        return {
          id: entry.packageId,
          sku: entry.packageId,
          title: `${faceTitle}（${mapped.titleZh}）`,
          price: usdPrice.toFixed(2),
          priceUsd: usdPrice.toFixed(2),
          priceCny: cnyPrice.toFixed(2),
          currency: "USD",
          faceCurrency: result.product.currency,
          stock: result.product.available ? 1 : 0,
          packageId: entry.packageId,
          faceValue: entry.faceValue,
          valueLabel: entry.valueLabel,
          catalogPrice: usdPrice.toFixed(2),
        };
      });

      if (skuVariants.length > 0) {
        mapped.price = skuVariants[0].priceUsd;
        mapped.priceUsd = skuVariants[0].priceUsd;
        mapped.priceCny = skuVariants[0].priceCny;
      }

      return json({
        supplier: "Bitrefill",
        usdtCnyRate,
        product: {
          ...mapped,
          isSku: result.product.packages.length > 1,
          description: `${mapped.titleZh}${result.product.categories?.length ? ` · 官方分类：${result.product.categories.join(" / ")}` : ""} · 地区：${result.product.country} · 当前汇率：1 USD ≈ ¥${usdtCnyRate.toFixed(2)}`,
          minQty: 1,
          maxQty: 1,
          specs: [],
          skuVariants,
          requiredInputs: [],
        },
        purchaseEnabled: false,
        requestId,
      });
    }

    return json({ error: "不支持的供应商查询", code: "BITREFILL_RESOURCE_INVALID", requestId }, 400);
  } catch (error) {
    const code = safeCode(error);
    console.error("[BitrefillAdmin] read failed", { requestId, code });
    const status = /AUTH|FORBIDDEN/.test(code)
      ? 403
      : /RATE|BUSY/.test(code)
        ? 429
        : /INVALID/.test(code)
          ? 400
          : /NOT_FOUND/.test(code)
            ? 404
            : 503;
    return json({ error: "Bitrefill 信息读取失败；不会执行购买", code, requestId }, status);
  }
}
