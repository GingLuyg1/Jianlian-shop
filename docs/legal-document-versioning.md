# 协议与政策版本管理

## 现有协议结构

项目已有 `legal_documents` 和 `order_agreement_acceptances`，由 `20260701_legal_documents_order_evidence.sql` 创建。

支持文档类型：

- `terms_of_service`
- `privacy_policy`
- `refund_policy`
- `digital_delivery_policy`
- `purchase_notice`

## 后台协议管理结果

后台入口：`/admin/settings/legal`

后台能力：

- 查看协议列表
- 创建草稿
- 编辑草稿
- 预览协议
- 发布新版本
- 归档旧版本
- 查看历史版本

发布和归档操作写入管理员审计日志。已发布协议不会直接覆盖正文，历史版本保留。

## 前台读取结果

公开接口：`GET /api/legal/current`

只返回 `status = published` 的协议版本。草稿不会被 checkout 使用。

## Checkout 协议确认结果

Checkout 提交订单时携带协议版本 ID 和内容哈希。服务端通过 `verifyCheckoutAgreements` 重新读取当前协议版本并校验：

- 版本存在
- 状态为 published
- 已生效
- 类型匹配
- 内容哈希匹配
- 四个必要协议均已确认

未勾选协议、协议读取失败或协议版本失效均会阻止下单。

## 订单协议证据结果

订单创建成功后通过 `recordOrderAgreementAcceptances` 保存：

- 订单 ID
- 用户 ID
- 协议类型
- 协议版本 ID
- 协议版本号
- 内容哈希
- 服务端确认时间
- IP 哈希
- User-Agent 摘要
- request_id

历史订单不会被新协议版本覆盖，也不会被自动伪造确认记录。

## 需要手动执行的 Migration

如果尚未执行：`20260701_legal_documents_order_evidence.sql`。