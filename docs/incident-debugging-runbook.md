# 故障排查运行手册

## 快速定位

1. 从用户截图或错误提示中获取 Request ID。
2. 打开后台：`/admin/system/request-traces/<requestId>`。
3. 查看链路事件是否包含：异常事件、审计日志、支付事件、订单事件、库存事件。
4. 如无记录，进入 `/admin/system-errors` 使用 Request ID 模糊查询。
5. 根据业务编号跳转到订单、支付、退款、用户或库存详情。

## 安全注意

- 不要求用户提供密码、验证码、Token 或支付密钥。
- 不在聊天或工单中复制完整卡密和数字库存内容。
- 不直接展示 Supabase 原始 SQL 错误给用户。
- 外部 Provider 错误只记录安全摘要。

## 常见断点

| 断点 | 排查方式 |
| --- | --- |
| 认证失败 | 检查 `AUTH_REQUIRED` 或 `PERMISSION_DENIED` |
| 商品保存失败 | 检查商品 API、SKU 保存和审计事件 |
| 订单创建失败 | 检查订单服务和库存预留事件 |
| 支付失败 | 检查支付会话、Provider 配置和回调验签 |
| 自动发货失败 | 检查库存分配、交付记录和 delivery 日志 |
| 余额异常 | 检查余额流水、退款或充值事件 |

## 升级处理

如果同一 fingerprint 多次出现，应进入异常中心标记为 `investigating`，确认修复后再标记 `resolved`。

## 不做事项

本手册不要求自动修改 PM2、Nginx、Cloudflare 或服务器日志配置，也不自动执行 Supabase migration。
