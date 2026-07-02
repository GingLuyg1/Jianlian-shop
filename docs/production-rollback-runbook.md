# Jianlian Shop 生产代码回滚手册

本手册只描述人工回滚流程，不自动执行命令。回滚前必须先判断是否涉及数据库 Migration。

## 适用场景

- 部署后页面白屏。
- 商品详情或 checkout 关键链路失败。
- 后台商品保存失败。
- 健康检查失败。
- PM2 启动失败。
- 新版本出现严重权限或资金风险。

## 回滚前记录

```bash
cd /www/jianlian-shop
git rev-parse HEAD
git log -1 --oneline
pm2 describe jianlian-shop
pm2 logs jianlian-shop --lines 200
```

保存：

- 故障版本 SHA。
- 目标回滚 SHA。
- PM2 配置摘要。
- 故障日志。
- 健康检查返回内容。

## 代码回滚步骤

```bash
cd /www/jianlian-shop
git status
git fetch origin
git checkout <OLD_GOOD_SHA>
npm ci
npm run build
pm2 restart jianlian-shop --update-env
pm2 describe jianlian-shop
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://www.jianlian.shop/api/health
```

要求：

- 不删除当前代码目录。
- 不使用未记录的随机 commit。
- 构建失败时不重启 PM2。
- 回滚后记录新的运行 SHA。

## 回滚后验证

必须验证：

- 首页可打开。
- 一级、二级、三级商品列表可打开。
- 商品详情不误报不存在。
- checkout 保持原版布局。
- 支付方式下拉存在。
- 后台登录正常。
- 后台商品列表正常。
- 后台商品编辑保存真实生效。
- `/api/health` 返回预期版本。

## 数据库回滚风险

代码回滚不等于数据库回滚。以下情况必须单独评估：

- 已执行不可逆 Migration。
- 新版本写入了新表或新字段。
- 新版本改变了订单、支付、余额或库存状态。
- 新版本改变了 RLS 策略。
- 新版本写入了审计或补偿任务。

数据库回滚原则：

- 优先使用向前修复。
- 不删除订单、支付、余额、库存、交付和审计数据。
- 不盲目 drop 表或字段。
- 如需恢复备份，先暂停写入并取得人工确认。

## 回滚失败处理

如果回滚构建失败：

1. 不重启 PM2。
2. 保持当前线上进程。
3. 保存构建日志。
4. 检查 Node 版本、依赖锁文件和环境变量。
5. 必要时切换到更早的已知稳定 SHA。
