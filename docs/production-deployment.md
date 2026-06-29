# Jianlian Shop 生产部署手册

## 本地上线前检查（Windows）

```powershell
git status --short
npm run build
```

如果有数据库 migration，需要先人工审查 SQL，确认不会删除现有数据。

## Linux 服务器部署步骤

以下步骤需要人工在服务器执行，不由应用自动执行：

```bash
cd /www/jianlian-shop

git fetch origin
git reset --hard origin/main

npm ci
npm run build

pm2 restart jianlian-shop
pm2 save

nginx -t
systemctl reload nginx
```

## 健康检查

```bash
curl -I https://www.jianlian.shop/
curl -I https://www.jianlian.shop/login
curl -I https://www.jianlian.shop/admin
curl -I https://www.jianlian.shop/_next/static/chunks/webpack-*.js
pm2 list
pm2 logs jianlian-shop --lines 80 --nostream
```

## 停止条件

出现以下任一情况，停止上线并回滚：

- `npm run build` 失败。
- `/` 首页白屏或裸 HTML。
- `/_next/static/*` 返回 400/404/502。
- 登录注册失败且控制台出现 chunk、hydration 或 Supabase 配置错误。
- PM2 反复重启。
- Nginx `nginx -t` 失败。
- 订单、充值、支付、库存任一关键接口返回 500。

## 上线后检查

- 首页、分类页、商品详情页样式正常。
- 登录、注册、退出登录正常。
- 普通用户不能访问 `/admin`。
- 管理员能访问 `/admin`。
- 后台商品、订单、充值、库存页面不白屏。
- 不出现 `Cannot read properties of null`、`MODULE_NOT_FOUND`、`ChunkLoadError`。