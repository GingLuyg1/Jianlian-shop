# SEO、性能、可访问性与收录验收报告

## Metadata 结果

- 根布局使用 Next.js Metadata API 设置默认标题模板、站点描述、canonical、Open Graph 和 Twitter Card。
- 首页使用 `Jianlian Shop | 数字商品服务` 作为唯一默认标题。
- 商品分类页分别设置了独立标题和描述：
  - 数字账号
  - AI 会员充值
  - 礼品卡与充值卡
  - 国际电话卡
  - 接码服务
  - 账户充值
- 商品详情通过 `app/products/[id]/layout.tsx` 动态读取真实商品名称、简短说明、主图和状态。
- `/admin`、登录、注册、账户中心、支付、订单结果、推广、找回密码和重置密码均设置 `noindex, nofollow`。
- 配置或数据查询失败时使用安全默认值，不阻断全站渲染。

## Open Graph 结果

- 全站默认分享图使用 `/assets/jianlian-brand-logo.png`。
- 商品详情优先使用商品主图，缺失时回退默认分享图。
- 分享图片通过 `https://www.jianlian.shop` 转为绝对地址。
- 售罄商品不会输出误导性购买状态，metadata 中标记为已售罄并 noindex。
- 不在分享信息中包含用户、订单、支付或交付参数。

## Canonical 结果

- 全站 canonical 使用正式域名 `https://www.jianlian.shop`。
- 未使用 localhost。
- 商品详情 canonical 使用 `/products/<slug>`，没有 slug 时安全回退商品 ID。

## Sitemap 结果

- 新增 `app/sitemap.ts`，生成 `/sitemap.xml`。
- 包含首页、公开商品分类、FAQ、教程和已上架商品详情。
- 不包含后台、API、登录、注册、账户中心、订单、支付和交付页面。
- 商品使用 slug，不主动暴露数据库内部 ID。
- 商品查询失败时仍保留静态公开页面。

## Robots 结果

- 新增 `app/robots.ts`，生成 `/robots.txt`。
- 允许公开前台页面和 `/assets/`。
- 禁止 `/admin/`、`/api/`、`/account/`、登录注册、checkout、payment、订单结果、订单查询等私有页面。
- robots 指向正式 sitemap 地址。

## 结构化数据结果

- 根布局输出 `Organization` 和 `WebSite` JSON-LD。
- 商品详情输出 `Product` + `Offer` JSON-LD。
- 商品结构化数据使用真实名称、描述、图片、价格和 CNY 币种。
- 有库存上架商品标记 `InStock`，售罄或非上架标记 `OutOfStock`。
- 未生成虚假评分、评价数量或用户/订单信息。
- 多 SKU 聚合价格仍需后续在公开 SKU 查询稳定后升级为 `AggregateOffer`。

## 图片优化结果

- 现有商品详情、商品卡片和移动端 Logo 已具备 alt 或回退图处理。
- 商品详情 metadata 分享图使用商品主图或默认图，避免空图片。
- 当前 `next.config.js` 仍配置 `images.unoptimized = true`，未在本次改动中切换图片优化，以避免破坏现有 Supabase/外部图片域名。
- 后续建议在确认图片域名后配置 `remotePatterns` 并逐步迁移到 `next/image`。

## 缓存和请求优化结果

- sitemap 使用服务端查询，失败降级。
- 商品详情 metadata 和页面主体仍各自读取一次商品数据；这是 client 商品页结构导致的折中，避免大规模重构。
- 用户、订单和支付相关页面均 noindex，不参与公共缓存策略。
- API 路由已有 `Cache-Control: no-store` 安全响应头。

## 可访问性结果

- 新增 404 和全局错误页提供明确标题、说明和可点击返回入口。
- 公共布局已有图标按钮 `aria-label`，品牌 Logo 有 alt。
- 主要按钮保留真实 `disabled` 状态。
- 弹窗焦点管理依赖现有 UI 组件和原生 popover；仍建议后续用浏览器辅助工具做人工键盘测试。

## 404 与错误页结果

- 新增 `app/not-found.tsx`，提供返回首页和浏览商品入口。
- 新增 `app/global-error.tsx`，避免技术堆栈暴露给用户。
- 商品详情 layout 对不存在、草稿或下架商品调用 `notFound()`。
- 不把所有错误统一跳转首页，避免无限重定向。

## 发现的问题

1. `app/products/layout.tsx` 和 `app/promotion/layout.tsx` 仍是默认 Next.js 模板，标题为 `Next.js`，并嵌套第二层 `<html><body>`。
2. 全站缺少 sitemap 和 robots。
3. 全站缺少品牌化 404 页面。
4. 商品详情没有动态 metadata 和 Product JSON-LD。
5. 后台和私有页面 noindex 覆盖不完整。

## 已修复的问题

- 修复产品和推广 layout 的默认模板问题。
- 增加全站默认 metadata、Open Graph、Twitter Card 和 canonical。
- 增加 sitemap 和 robots。
- 增加商品详情动态 metadata 和 Product JSON-LD。
- 增加后台、账户、登录、注册、支付和订单结果 noindex。
- 增加 404 和 global error 页面。

## 仍存在的问题

- 商品详情页仍是 client component，metadata 与页面主体存在重复读取。
- 多 SKU 结构化数据暂未升级到 `AggregateOffer`。
- `next/image` 未全面替换原有 `<img>`，需要确认外部图片域名后分阶段处理。
- 未通过真实浏览器 Lighthouse 做移动端和键盘操作实测，本次只完成代码级与构建验收。
