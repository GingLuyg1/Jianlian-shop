# 生产数据初始化与封板准备

## 必须配置项

- 超级管理员：通过 Supabase Auth 创建账号，并在 `profiles.role` 设置为 `admin`。
- 网站名称、品牌信息、正式域名：在站点设置中维护，不在代码中写死。
- 默认币种与业务时区：沿用项目统一配置，默认建议 `CNY` 与 `Asia/Shanghai`。
- 订单编号规则：使用现有订单创建服务和数据库唯一约束。
- 支付渠道：真实 Provider 接入前保持关闭或未配置，不生成假二维码、假地址和假交易号。
- 隐私政策、用户协议、公告：上线前必须替换演示文本。
- 邮件配置：未配置时标记未接入，不伪造发送成功。
- 库存配置：数字库存未配置时不得标记自动发货可用。

## 测试数据识别原则

- 不只通过名称判断，需要同时查看邮箱、业务编号、备注、metadata、Provider 环境和创建来源。
- 命中 `test/demo/mock/sandbox/example/sample/dev/local/localhost/fake/placeholder` 只能判定为疑似。
- 真实失败订单、真实支付异常和真实用户不能因状态异常被清理。
- 支付记录、余额流水、交付记录和审计日志原则上保留，除非有明确合规清理依据。
- 数字库存清理优先禁用 `available` 测试库存，避免误删已预留或已交付记录。

## 环境来源标识

建议执行兼容 migration：

- `supabase/migrations/20260630_data_origin_labels.sql`

新增字段用于未来数据标识：

- `source_environment`
- `data_origin`
- `is_test`
- `provider_environment`

历史数据不自动回填，需人工核对后分批标记。

## 上线前阻塞项

- 缺少超级管理员。
- 站点正式域名、协议、公告仍是演示内容。
- 支付渠道在真实 Provider 未配置前被启用。
- 疑似测试订单、支付、余额、库存或交付记录未完成核对。
- 数据库关键 migration 未执行。
- Service Role 或支付密钥出现在前端环境变量。

## 检查入口

后台只读页面：

```text
/admin/system/production-readiness
```

该页面只展示统计、风险和处理建议，不提供删除按钮，不执行 SQL。
