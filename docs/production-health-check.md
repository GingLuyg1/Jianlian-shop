# Jianlian Shop 生产健康检查清单

## 页面检查

- [ ] `/` 首页样式正常。
- [ ] `/products/digital-accounts` 分类页正常。
- [ ] `/checkout` 未带商品时显示友好状态。
- [ ] `/login`、`/register` 可打开。
- [ ] `/account/orders` 未登录跳转登录。
- [ ] `/admin` 未登录跳转登录。
- [ ] 管理员登录后可进入 `/admin`。

## 静态资源

- [ ] `/_next/static/chunks/webpack-*.js` 返回 200。
- [ ] CSS 正常加载，不是裸 HTML。
- [ ] 图片缺失时显示占位图，不白屏。

## 数据库

- [ ] Supabase 环境变量存在且不是占位值。
- [ ] `profiles` 中管理员 role 为 `admin`。
- [ ] `products`、`categories` 可读取。
- [ ] `orders`、`order_items`、`order_status_logs`、`order_deliveries` 存在。
- [ ] `account_recharges`、`payment_sessions`、`balance_transactions` 存在。
- [ ] `digital_inventory`、`digital_inventory_batches` 存在。

## 支付 readiness

- [ ] 支付渠道未配置时不生成假二维码或假成功。
- [ ] 支付回调接口要求验签或内部密钥。
- [ ] 重复回调不重复入账。
- [ ] 错误对账密钥返回 403。

## 订单和库存

- [ ] 下单价格由服务端读取商品价格。
- [ ] 用户只能查看自己的订单。
- [ ] 管理员能查看全部订单。
- [ ] 自动发货不泄露其他订单交付内容。
- [ ] 已交付库存不能恢复为可用。

## 服务

```bash
pm2 list
pm2 logs jianlian-shop --lines 80 --nostream
nginx -t
systemctl status nginx --no-pager
curl -I https://www.jianlian.shop/
```

## HTTPS 与响应头

- [ ] HTTPS 证书有效。
- [ ] `X-Content-Type-Options: nosniff`。
- [ ] `X-Frame-Options: DENY`。
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`。
- [ ] 生产 HTTPS 启用 HSTS。