// Strictly read-only Humkt catalog & price comparison CLI.
// Usage (PowerShell, single-command env, never save token into files or logs):
//   $env:HUMKT_API_TOKEN="<token>"; node scripts/probe-humkt-readonly.mjs --mode compare --seller-type self
// Optional flags:
//   --mode categories | catalog | prices | compare (default: compare)
//   --seller-type self | seller | all (default: self)
//   --in-stock 1 | 0 (default: 1)
//   --q <keyword>
//   --category-id <id>
//   --max-pages <1..50> (default: 10)
//   --ids 1,2,3 (for --mode prices)
//   --out <markdown_report_path> (optional report output)
// NEVER prints API token, auth headers, or exact upstream balance.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createHumktReadonlyClient,
  HumktReadError,
  parseDecimalCny,
} from '../lib/providers/humkt/readonly-client.mjs';

const PLATFORM_RULES = [
  { key: 'gmail', label: 'Gmail / Google', re: /\bgmail\b|\bgoogle\b|谷歌邮箱/i },
  { key: 'apple', label: 'Apple ID', re: /apple\s*id|苹果账号|美区\s*id|小火箭/i },
  { key: 'telegram', label: 'Telegram', re: /\btelegram\b|\btg\b|电报|飞机号/i },
  { key: 'tiktok', label: 'TikTok', re: /\btiktok\b|\btk\b|抖音海外/i },
  { key: 'twitter', label: 'X / Twitter', re: /\btwitter\b|\bx账号\b|推特/i },
  { key: 'instagram', label: 'Instagram', re: /\binstagram\b|\bins\b/i },
  { key: 'outlook', label: 'Outlook / Hotmail', re: /\boutlook\b|\bhotmail\b|微软邮箱/i },
  { key: 'chatgpt', label: 'ChatGPT / OpenAI', re: /chatgpt|\bgpt\b|openai/i },
  { key: 'claude', label: 'Claude', re: /\bclaude\b|anthropic/i },
  { key: 'gemini', label: 'Gemini', re: /\bgemini\b/i },
  { key: 'facebook', label: 'Facebook', re: /\bfacebook\b|\bfb\b/i },
  { key: 'discord', label: 'Discord', re: /\bdiscord\b/i },
  { key: 'steam', label: 'Steam', re: /\bsteam\b/i },
];

export function classifyPlatform(name, categoryText = '') {
  const hay = `${name ?? ''} ${categoryText ?? ''}`;
  for (const rule of PLATFORM_RULES) {
    if (rule.re.test(hay)) return rule;
  }
  return { key: 'other', label: '其他品类' };
}

export function normalizeHumktProduct(raw) {
  const priceStr = parseDecimalCny(raw?.price);
  const price = priceStr !== null ? Number(priceStr) : null;
  const stock = Number(raw?.in_stock ?? raw?.stock ?? 0);
  const sellerType = String(raw?.seller_type ?? (raw?.is_self ? 'self' : 'unknown'));
  const isGroup = Boolean(raw?.is_group);
  const isSelectable = Boolean(raw?.is_selectable);
  const buyerInfo = raw?.buyer_info ?? null;
  const standardAutoEligible =
    sellerType === 'self' && !isGroup && !isSelectable && !buyerInfo && stock > 0 && price !== null;

  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? raw?.title ?? '').trim(),
    category: String(raw?.category_name ?? raw?.category?.name ?? '').trim(),
    price,
    stock: Number.isFinite(stock) ? stock : 0,
    sellerType,
    isGroup,
    isSelectable,
    buyerInfo,
    standardAutoEligible,
  };
}

export function buildPlatformSummary(products) {
  const buckets = new Map();
  for (const item of products) {
    const plat = classifyPlatform(item.name, item.category);
    if (!buckets.has(plat.key)) {
      buckets.set(plat.key, {
        key: plat.key,
        label: plat.label,
        total: 0,
        selfCount: 0,
        standardAutoCount: 0,
        minPrice: null,
        maxPrice: null,
        samples: [],
      });
    }
    const bucket = buckets.get(plat.key);
    bucket.total += 1;
    if (item.sellerType === 'self') bucket.selfCount += 1;
    if (item.standardAutoEligible) bucket.standardAutoCount += 1;
    if (item.price !== null) {
      bucket.minPrice = bucket.minPrice === null ? item.price : Math.min(bucket.minPrice, item.price);
      bucket.maxPrice = bucket.maxPrice === null ? item.price : Math.max(bucket.maxPrice, item.price);
    }
    if (bucket.samples.length < 5) {
      bucket.samples.push(item);
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}

export function renderComparisonMarkdown({
  sellerType,
  pagesFetched,
  truncated,
  humktProducts,
  localProducts = [],
}) {
  const humktBuckets = buildPlatformSummary(humktProducts);
  const localByPlatform = new Map();
  for (const lp of localProducts) {
    const plat = classifyPlatform(lp.name, lp.category_path ?? lp.category ?? '');
    const price = Number(lp.price ?? lp.minPrice ?? 0);
    if (!localByPlatform.has(plat.key)) {
      localByPlatform.set(plat.key, { count: 0, minPrice: null, maxPrice: null });
    }
    const entry = localByPlatform.get(plat.key);
    entry.count += 1;
    if (Number.isFinite(price) && price > 0) {
      entry.minPrice = entry.minPrice === null ? price : Math.min(entry.minPrice, price);
      entry.maxPrice = entry.maxPrice === null ? price : Math.max(entry.maxPrice, price);
    }
  }

  const lines = [
    `# Humkt 只读商品与价格对比报告`,
    '',
    `- 采样范围：\`seller_type=${sellerType}\`，拉取页数：\`${pagesFetched}\`${truncated ? '（已达 maxPages 上限）' : ''}`,
    `- Humkt 采集在售商品数：**${humktProducts.length}**（其中可直接走标准自动发卡：${humktProducts.filter((p) => p.standardAutoEligible).length}）`,
    `- 本站公开对照商品数：**${localProducts.length}**`,
    `- 安全声明：纯 GET 只读拉取，未执行任何下单、扣款或数据库写入；不含任何 Token 或余额数值。`,
    '',
    '## 分平台价格区间对比（CNY）',
    '',
    '| 平台 | Humkt 商品数 (自营/标准卡密) | Humkt 标价区间 | 本站在售数 | 本站售价区间 |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const b of humktBuckets) {
    const local = localByPlatform.get(b.key);
    const humktRange =
      b.minPrice !== null ? `¥${b.minPrice.toFixed(2)} ~ ¥${b.maxPrice.toFixed(2)}` : '-';
    const localRange =
      local && local.minPrice !== null ? `¥${local.minPrice.toFixed(2)} ~ ¥${local.maxPrice.toFixed(2)}` : '-';
    lines.push(
      `| ${b.label} | ${b.total} (${b.selfCount}/${b.standardAutoCount}) | ${humktRange} | ${local?.count ?? 0} | ${localRange} |`
    );
  }

  lines.push('', '## 各平台代表性标准商品抽样（每类最多 5 条）', '');
  for (const b of humktBuckets) {
    if (b.key === 'other' && humktBuckets.length > 3) continue;
    lines.push(`### ${b.label}`);
    for (const s of b.samples) {
      const p = s.price !== null ? `¥${s.price.toFixed(2)}` : 'N/A';
      lines.push(
        `- \`#${s.id}\` ${s.name} — **${p}** | 库存 ${s.stock} | ${s.sellerType}${s.standardAutoEligible ? ' · 标准自营秒发' : ''}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function parseCliArgs(argv) {
  const opts = {
    mode: 'compare',
    sellerType: 'self',
    inStock: true,
    q: undefined,
    categoryId: undefined,
    maxPages: 10,
    ids: [],
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--mode' && next) {
      opts.mode = next;
      i += 1;
    } else if (flag === '--seller-type' && next) {
      opts.sellerType = next;
      i += 1;
    } else if (flag === '--in-stock' && next !== undefined) {
      opts.inStock = next !== '0' && next !== 'false';
      i += 1;
    } else if (flag === '--q' && next !== undefined) {
      opts.q = next;
      i += 1;
    } else if (flag === '--category-id' && next !== undefined) {
      opts.categoryId = next;
      i += 1;
    } else if (flag === '--max-pages' && next !== undefined) {
      opts.maxPages = Number(next);
      i += 1;
    } else if (flag === '--ids' && next !== undefined) {
      opts.ids = next.split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (flag === '--out' && next !== undefined) {
      opts.out = next;
      i += 1;
    }
  }
  return opts;
}

async function fetchPublicLocalProducts(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('https://www.jianlian.shop/api/catalog/products?page=1&pageSize=500', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data?.products)
      ? data.products
      : Array.isArray(data?.data)
        ? data.data
        : [];
    return rows;
  } catch {
    return [];
  }
}

export async function runProbe({
  apiToken = process.env.HUMKT_API_TOKEN,
  options = {},
  fetchImpl = fetch,
} = {}) {
  const client = createHumktReadonlyClient({ apiToken, fetchImpl });
  const mode = options.mode ?? 'compare';

  if (mode === 'categories') {
    const categories = await client.readCategories({ flat: false });
    return {
      operation: 'HUMKT_READONLY_CATEGORIES',
      categoryCount: categories.length,
      purchaseExecuted: false,
      productionChanged: false,
      categories: categories.slice(0, 50).map((c) => ({
        id: c?.id ?? null,
        name: c?.name ?? null,
        count: c?.count ?? null,
      })),
    };
  }

  if (mode === 'prices') {
    const prices = await client.readPricesBatch(options.ids ?? []);
    return {
      operation: 'HUMKT_READONLY_PRICES',
      requestedCount: (options.ids ?? []).length,
      returnedCount: prices.length,
      purchaseExecuted: false,
      productionChanged: false,
      prices,
    };
  }

  const collected = await client.collectProducts({
    q: options.q,
    categoryId: options.categoryId,
    inStock: options.inStock ?? true,
    sellerType: options.sellerType ?? 'self',
    maxPages: options.maxPages ?? 10,
  });
  const normalized = collected.items.map(normalizeHumktProduct);

  if (mode === 'catalog') {
    return {
      operation: 'HUMKT_READONLY_CATALOG',
      sellerType: options.sellerType ?? 'self',
      pagesFetched: collected.pagesFetched,
      truncated: collected.truncated,
      collectedCount: normalized.length,
      standardAutoEligibleCount: normalized.filter((p) => p.standardAutoEligible).length,
      platforms: buildPlatformSummary(normalized).map(({ samples, ...rest }) => rest),
      purchaseExecuted: false,
      productionChanged: false,
    };
  }

  if (mode === 'compare') {
    const localProducts = await fetchPublicLocalProducts(fetchImpl);
    const markdown = renderComparisonMarkdown({
      sellerType: options.sellerType ?? 'self',
      pagesFetched: collected.pagesFetched,
      truncated: collected.truncated,
      humktProducts: normalized,
      localProducts,
    });
    if (options.out) {
      writeFileSync(resolve(options.out), markdown, 'utf8');
    }
    return {
      operation: 'HUMKT_READONLY_COMPARE',
      sellerType: options.sellerType ?? 'self',
      pagesFetched: collected.pagesFetched,
      truncated: collected.truncated,
      humktCount: normalized.length,
      standardAutoEligibleCount: normalized.filter((p) => p.standardAutoEligible).length,
      localCount: localProducts.length,
      reportPath: options.out ? resolve(options.out) : null,
      markdown: options.out ? undefined : markdown,
      purchaseExecuted: false,
      productionChanged: false,
    };
  }

  throw new HumktReadError('MODE_INVALID');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseCliArgs(process.argv.slice(2));
  runProbe({ options })
    .then((result) => {
      if (result.markdown) {
        process.stdout.write(result.markdown + '\n');
      } else {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      }
    })
    .catch((error) => {
      const code = /^HUMKT_[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'HUMKT_PROBE_FAILED';
      process.stderr.write(`PROBE_ERROR=${code}\n`);
      if (code === 'HUMKT_TOKEN_MISSING') {
        process.stderr.write(
          'HINT: Set HUMKT_API_TOKEN in the current shell session only (never commit or echo it), e.g.:\n' +
            '  $env:HUMKT_API_TOKEN="<your-token>"; node scripts/probe-humkt-readonly.mjs --mode compare --seller-type self\n'
        );
      }
      process.exitCode = 1;
    });
}
