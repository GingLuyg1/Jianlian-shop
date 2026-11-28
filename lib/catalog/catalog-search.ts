const TRAD_TO_SIMP_MAP: Record<string, string> = {
  蘋: "苹", 臺: "台", 灣: "湾", 韓: "韩", 國: "国", 區: "区",
  德: "德", 法: "法", 歐: "欧", 遊: "游", 戲: "戏", 禮: "礼",
  儲: "储", 帳: "账", 號: "号", 郵: "邮", 電: "电", 話: "话",
  費: "费", 實: "实", 體: "体", 會: "会", 員: "员", 註: "注",
  冊: "册", 獨: "独", 飛: "飞", 點: "点", 網: "网", 碼: "码",
  機: "机", 聯: "联", 亞: "亚", 馬: "马", 遜: "逊", 愛: "爱",
  買: "买", 賣: "卖", 資: "资", 額: "额", 幣: "币", 錢: "钱",
  銀: "银", 華: "华", 東: "东", 西: "西", 廣: "广", 達: "达",
  豐: "丰", 樂: "乐", 訊: "讯", 軟: "软", 雲: "云", 數: "数",
  據: "据", 鎖: "锁", 開: "开", 通: "通", 換: "换", 購: "购",
  戰: "战", 暴: "暴", 羅: "罗", 蘭: "兰", 賓: "宾", 邁: "迈",
  爾: "尔", 維: "维", 薩: "萨", 紐: "纽", 澳: "澳", 烏: "乌",
  祕: "秘", 魯: "鲁", 智: "智", 哥: "哥", 倫: "伦", 巴: "巴",
};

const SEARCH_ALIAS_GROUPS: string[][] = [
  // 热门国家与地区 + 币种
  ["美区", "美国", "us", "usa", "usd", "美金", "美元"],
  ["英区", "英国", "uk", "gb", "gbp", "英镑"],
  ["日区", "日本", "jp", "japan", "jpy", "日元"],
  ["土区", "土耳其", "tr", "turkey", "try", "里拉"],
  ["港区", "香港", "hk", "hkd", "港币"],
  ["台区", "台湾", "tw", "twd", "台币"],
  ["印区", "印度", "in", "india", "inr", "卢比"],
  ["韩区", "韩国", "kr", "korea", "krw"],
  ["加区", "加拿大", "ca", "canada", "cad"],
  ["澳区", "澳大利亚", "澳洲", "au", "australia", "aud"],
  ["欧区", "欧洲", "eu", "europe", "eur", "欧元"],
  ["德区", "德国", "de", "germany"],
  ["法区", "法国", "fr", "france"],
  ["西区", "西班牙", "es", "spain"],
  ["意区", "意大利", "it", "italy"],
  ["荷区", "荷兰", "nl", "netherlands"],
  ["埃及", "eg", "egypt", "egp"],
  ["巴西", "br", "brazil", "brl"],
  ["墨西哥", "mx", "mexico", "mxn"],
  ["印尼", "印度尼西亚", "id", "indonesia", "idr"],
  ["波兰", "pl", "poland", "pln"],
  ["瑞士", "ch", "switzerland", "chf"],
  ["瑞典", "se", "sweden"],
  ["挪威", "no", "norway"],
  ["丹麦", "dk", "denmark"],
  ["阿联酋", "迪拜", "ae", "uae", "aed"],
  ["沙特", "沙特阿拉伯", "sa", "sar"],
  ["新西兰", "纽西兰", "nz", "new zealand", "nzd"],
  ["新加坡", "坡县", "sg", "singapore", "sgd"],
  ["泰国", "th", "thailand", "thb"],
  ["越南", "vn", "vietnam"],
  ["菲律宾", "菲区", "ph", "philippines"],
  ["马来西亚", "马来", "my", "malaysia"],
  ["南非", "za", "south africa"],
  ["阿根廷", "阿区", "ar", "argentina"],
  ["哥伦比亚", "co", "colombia"],
  ["智利", "cl", "chile"],
  ["秘鲁", "pe", "peru"],
  ["乌克兰", "ua", "ukraine"],

  // 礼品卡 & 游戏 & 娱乐平台
  ["苹果", "apple", "itunes", "app store", "appstore", "ios"],
  ["谷歌", "google", "google play", "googleplay", "gp", "谷歌商店", "play卡"],
  ["奈飞", "网飞", "netflix", "nf"],
  ["索尼", "psn", "playstation", "ps4", "ps5"],
  ["微软游戏", "xbox", "xgp", "game pass", "gamepass"],
  ["任天堂", "老任", "nintendo", "eshop", "switch", "ns"],
  ["蒸汽", "steam"],
  ["暴雪", "战网", "blizzard", "battlenet", "battle.net", "魔兽", "炉石"],
  ["亚马逊", "amazon", "amz"],
  ["爱彼迎", "airbnb", "民宿"],
  ["我的世界", "mc", "minecraft"],
  ["老鼠台", "图奇", "twitch"],

  // AI 会员 & 数字社媒账号
  ["gpt", "chatgpt", "openai", "gpt4", "gpt5", "plus", "pro"],
  ["claude", "克劳德", "anthropic"],
  ["gemini", "双子座"],
  ["grok", "马斯克", "xai"],
  ["小火箭", "shadowrocket"],
  ["圈x", "quantumult", "qx"],
  ["gmail", "谷歌邮箱"],
  ["outlook", "hotmail", "微软邮箱", "live邮箱"],
  ["tg", "telegram", "电报", "飞机", "纸飞机"],
  ["twitter", "推特", "小蓝鸟", "x-twitter"],
  ["facebook", "fb", "脸书"],
  ["instagram", "ins", "ig"],
  ["youtube", "油管", "yt", "ytb"],
  ["tiktok", "tk", "海外抖音"],
  ["discord", "dc"],
  ["whatsapp", "wa"],
  ["linkedin", "领英"],
  ["github", "git"],
  ["threads", "串文"],

  // 国际 SIM 卡 & 运营商 & 话费充值
  ["giffgaff", "gg卡", "蛋卡"],
  ["vodafone", "沃达丰"],
  ["orange", "橘子卡", "橙卡"],
  ["movistar"],
  ["rakuten", "乐天"],
  ["one nz", "onenz", "新西兰卡"],
  ["haha", "哈哈卡"],
  ["lucky2", "lucky"],
  ["t-mobile", "tmobile", "t mobile"],
  ["ultra", "紫卡"],
  ["air mobile", "airmobile"],
  ["ee"],
  ["three", "3uk"],
  ["lebara", "乐巴拉"],
  ["lyca", "lycamobile", "莱卡"],
  ["at&t", "att", "atandt"],
  ["verizon", "威瑞森"],
  ["simple mobile", "简单移动"],
  ["red pocket", "红口袋", "红袋"],
  ["sim", "sim卡", "电话卡", "手机卡", "实体卡", "保号卡", "漫游卡"],
  ["话费", "充值卡", "pin", "topup", "refill", "sim 卡服务"],
  ["礼品卡", "gift card", "giftcard", "点卡", "兑换卡"],
  ["成品号", "成品", "独享号", "独享", "老号", "新号"],
];

// Compound CJK phrases that users frequently type together without spaces (e.g. "美区苹果", "苹果土耳其", "英国话费", "日区任天堂")
const CJK_SPLIT_LEXICON: string[] = Array.from(
  new Set([
    ...SEARCH_ALIAS_GROUPS.flat().filter((term) => /[\u4e00-\u9fff]/.test(term) && term.length >= 2),
    "苹果id",
    "礼品卡",
    "充值卡",
    "话费卡",
    "电话卡",
    "手机卡",
    "实体卡",
    "保号卡",
    "会员充值",
    "成品号",
    "白号",
    "老号",
    "新号",
    "独享",
    "话费",
    "充值",
    "邮箱",
    "账号",
    "会员",
    "谷歌",
    "苹果",
    "微软",
    "索尼",
    "暴雪",
    "战网",
  ])
).sort((a, b) => b.length - a.length);

export function normalizeCatalogSearchText(input: string): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    // Full-width ASCII -> half-width ASCII
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
    } else if (code === 0x3000) {
      out += " ";
    } else {
      out += TRAD_TO_SIMP_MAP[ch] ?? ch;
    }
  }
  return out.toLowerCase().trim();
}

function segmentCjkCompound(chunk: string): string[] {
  if (chunk.length <= 2 || !/^[\u4e00-\u9fff]+$/.test(chunk)) {
    return [chunk];
  }
  // If the entire chunk is itself a single known term (e.g. "印度尼西亚", "沙特阿拉伯", "礼品卡"), keep it whole
  if (CJK_SPLIT_LEXICON.includes(chunk)) {
    return [chunk];
  }

  const tokens: string[] = [];
  let cursor = 0;
  let matchedCount = 0;

  while (cursor < chunk.length) {
    let hit = "";
    for (const term of CJK_SPLIT_LEXICON) {
      if (term.length < chunk.length && chunk.startsWith(term, cursor)) {
        hit = term;
        break;
      }
    }
    if (hit) {
      tokens.push(hit);
      cursor += hit.length;
      matchedCount += 1;
    } else {
      // Accumulate unmatched characters until the next lexicon match
      let next = cursor + 1;
      while (next < chunk.length) {
        let upcoming = false;
        for (const term of CJK_SPLIT_LEXICON) {
          if (term.length < chunk.length && chunk.startsWith(term, next)) {
            upcoming = true;
            break;
          }
        }
        if (upcoming) break;
        next += 1;
      }
      tokens.push(chunk.slice(cursor, next));
      cursor = next;
    }
  }

  return matchedCount > 0 && tokens.length > 1 ? tokens : [chunk];
}

export function tokenizeSearchKeyword(rawKeyword: string): string[] {
  const normalized = normalizeCatalogSearchText(rawKeyword);
  if (!normalized) return [];

  const roughParts = normalized
    .split(/[\s,，、/+|()（）【】[\]·•]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const tokens: string[] = [];
  for (const part of roughParts) {
    // Split CJK vs Latin/digit boundaries (e.g. "美区apple" -> ["美区", "apple"], "gmail老号" -> ["gmail", "老号"])
    const scriptParts = part.match(/[\u4e00-\u9fff]+|[a-z0-9.&-]+/g) ?? [part];
    for (const sp of scriptParts) {
      const cleaned = sp.trim();
      if (!cleaned) continue;
      if (/^[\u4e00-\u9fff]+$/.test(cleaned)) {
        tokens.push(...segmentCjkCompound(cleaned));
      } else {
        tokens.push(cleaned);
      }
    }
  }

  return Array.from(new Set(tokens.filter(Boolean)));
}

const ALIAS_LOOKUP = (() => {
  const map = new Map<string, string[]>();
  for (const group of SEARCH_ALIAS_GROUPS) {
    const normalizedGroup = Array.from(new Set(group.map((g) => normalizeCatalogSearchText(g)).filter(Boolean)));
    for (const item of normalizedGroup) {
      const existing = map.get(item);
      if (existing) {
        map.set(item, Array.from(new Set([...existing, ...normalizedGroup])));
      } else {
        map.set(item, normalizedGroup);
      }
    }
  }
  return map;
})();

export function expandSearchToken(token: string): string[] {
  const norm = normalizeCatalogSearchText(token);
  if (!norm) return [];
  return ALIAS_LOOKUP.get(norm) ?? [norm];
}

function matchVariant(haystack: string, variant: string): boolean {
  if (!variant) return false;
  // For ultra-short 2-letter ASCII country/brand codes (like "in", "id", "us", "uk", "de", "ca", "es", "fr", "it", "my", "sa", "ar", "co", "pe", "wa", "dc", "ns", "mc", "nf", "tg", "fb", "yt", "ig", "tk", "ee", "ps"),
  // require word boundaries so "in" doesn't falsely match "minecraft" or "linkedin"!
  if (/^[a-z]{2}$/.test(variant)) {
    const re = new RegExp(`(?:^|[^a-z0-9])${variant}(?:$|[^a-z0-9])`);
    return re.test(haystack);
  }
  return haystack.includes(variant);
}

export type SearchableProductInput = {
  name?: string | null;
  slug?: string | null;
  short_description?: string | null;
  category_path?: string | null;
  skuTexts?: Array<string | null | undefined>;
};

/**
 * Returns 0 if the product does NOT match the search keyword.
 * Returns a positive relevance score (higher = better match) when it matches.
 */
export function scoreProductSearch(input: SearchableProductInput, rawKeyword: string): number {
  const normalizedQuery = normalizeCatalogSearchText(rawKeyword);
  if (!normalizedQuery) return 1;

  const titleNorm = normalizeCatalogSearchText(input.name ?? "");
  const slugNorm = normalizeCatalogSearchText(input.slug ?? "");
  const categoryNorm = normalizeCatalogSearchText(input.category_path ?? "");
  const descNorm = normalizeCatalogSearchText(input.short_description ?? "");
  const skuNorm = normalizeCatalogSearchText((input.skuTexts ?? []).filter(Boolean).join(" "));
  const fullHaystack = [titleNorm, slugNorm, categoryNorm, descNorm, skuNorm].filter(Boolean).join(" ");

  // Fast exact/contiguous hit check
  let score = 0;
  const contiguousHit = fullHaystack.includes(normalizedQuery);
  if (contiguousHit) {
    if (titleNorm === normalizedQuery) score += 160;
    else if (titleNorm.startsWith(normalizedQuery)) score += 110;
    else if (titleNorm.includes(normalizedQuery)) score += 85;
    else if (categoryNorm.includes(normalizedQuery)) score += 50;
    else if (slugNorm.includes(normalizedQuery)) score += 45;
    else score += 30;
  }

  const tokens = tokenizeSearchKeyword(normalizedQuery);
  if (tokens.length === 0) return score || 1;

  let allTokensMatched = true;
  let titleTokenHits = 0;
  let categoryTokenHits = 0;

  for (const token of tokens) {
    const variants = expandSearchToken(token);
    const inFull = variants.some((v) => matchVariant(fullHaystack, v));
    if (!inFull) {
      allTokensMatched = false;
      break;
    }
    if (variants.some((v) => matchVariant(titleNorm, v))) {
      titleTokenHits += 1;
    } else if (variants.some((v) => matchVariant(categoryNorm, v))) {
      categoryTokenHits += 1;
    }
  }

  if (!contiguousHit && !allTokensMatched) return 0;

  if (allTokensMatched) {
    score += 20;
    score += titleTokenHits * 25;
    score += categoryTokenHits * 12;
    if (titleTokenHits === tokens.length) score += 35;
  }

  return Math.max(score, 1);
}
