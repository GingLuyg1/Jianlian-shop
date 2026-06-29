# Jianlian Shop 生产回滚手册

## 回滚前记录

```bash
cd /www/jianlian-shop
git rev-parse HEAD
pm2 list
pm2 logs jianlian-shop --lines 80 --nostream
```

记录当前 commit、故障时间、访问路径、PM2 日志和浏览器 Console 错误。

## 回滚到上一稳定版本

```bash
cd /www/jianlian-shop

git fetch origin
git reset --hard <stable_commit>

npm ci
npm run build

pm2 restart jianlian-shop
pm2 save

nginx -t
systemctl reload nginx
```

## 数据库 migration 注意事项

- 已执行的 migration 不要直接手工反向删除字段或表。
- 如果 migration 只新增兼容字段，通常代码回滚即可。
- 如果 migration 改变了写入逻辑，先暂停订单、充值、支付回调、自动发货。
- 回滚前导出 orders、payments、account_recharges、balance_transactions、digital_inventory。
- 需要数据回滚时先在 staging 验证，再操作生产。

## 回滚后验证

- 首页不白屏。
- 静态资源 200。
- 登录注册正常。
- 管理员后台正常。
- 订单和充值列表可查询。
- 数字库存未出现重复发货或状态回退。
- PM2 无持续错误日志。