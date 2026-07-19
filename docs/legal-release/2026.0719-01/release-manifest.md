# Jianlian 正式协议发布清单

版本：`2026.0719-01`

## 正文格式

- 后台正文按纯文本保存和展示，不解析 Markdown 或 HTML。
- 正文文件已移除一级标题、版本行和 Markdown 标记；后台标题与版本字段单独填写。
- 章节、编号、段落和换行已保留，可以直接全选复制到后台正文框。
- `SHA-256（文件）` 是 body 文件原始字节哈希。
- `后台预期 content_hash` 按当前代码对正文执行 `trim()` 后，以 UTF-8 计算 SHA-256；发布后应以此值核对数据库返回的内容哈希。
- 推荐生效时间：后台生效时间留空，由发布操作在成功时设置为当前时间，避免提前生效或未来时间阻止公开读取。

## 发布内容

### 1. Jianlian 用户协议

- document_type：`terms_of_service`
- 后台标题：`Jianlian 用户协议`
- 版本号：`2026.0719-01`
- 内容摘要：平台服务范围、用户信息责任、下单付款、数字交付、退款售后、禁止行为、隐私安全、免费基础推广建议和争议处理。
- 正文文件：`terms-of-service.body.txt`
- 正文字数：2,837（去除空白后的字符数）
- SHA-256（文件）：`d48d3bb01194227ba21ff9d75ebac8b26571f5b353739c3869cde01e57af3e76`
- 后台预期 content_hash：`d58be45eed568178692790ccc9c6fe5053cb02d7a101216dbf19f871d6667c35`
- 推荐生效时间：留空，发布成功时立即生效
- 推荐发布顺序：1

### 2. Jianlian 退款政策

- document_type：`refund_policy`
- 后台标题：`Jianlian 退款政策`
- 版本号：`2026.0719-01`
- 内容摘要：退款申请条件、人工审核、数字商品退款限制、自动处理订单、退款金额、余额及 USDT 人工退款、处理时间和库存规则。
- 正文文件：`refund-policy.body.txt`
- 正文字数：1,926（去除空白后的字符数）
- SHA-256（文件）：`d0bd958ddea58ed87396724cf1437898b359aa7875f504a31737e403ad1bd6dd`
- 后台预期 content_hash：`fb50e7ae496d5dacc298b1566888d544ceabda50058b12c4ac9f653cfb6a7ef7`
- 推荐生效时间：留空，发布成功时立即生效
- 推荐发布顺序：2

### 3. Jianlian 数字商品交付规则

- document_type：`digital_delivery_policy`
- 后台标题：`Jianlian 数字商品交付规则`
- 版本号：`2026.0719-01`
- 内容摘要：付款确认、自动与人工交付、24 小时自动排单、延迟查询、接收信息责任、数字内容安全和交付异常处理。
- 正文文件：`digital-delivery-policy.body.txt`
- 正文字数：1,580（去除空白后的字符数）
- SHA-256（文件）：`9e7c0707e4718c3ca03959678876523a73c7ec6ab59dce974cc0105be9d26851`
- 后台预期 content_hash：`d8ca9b1c3592ce5065fc9efe0984be7fb6d399925d8effe72816aae6c0d03183`
- 推荐生效时间：留空，发布成功时立即生效
- 推荐发布顺序：3

### 4. Jianlian 商品购买须知

- document_type：`purchase_notice`
- 后台标题：`Jianlian 商品购买须知`
- 版本号：`2026.0719-01`
- 内容摘要：下单核对、防止重复下单、自动处理后的取消限制、24 小时自动排单、超过 24 小时催单、USDT-BEP20 核验和退款限制。
- 正文文件：`purchase-notice.body.txt`
- 正文字数：1,900（去除空白后的字符数）
- SHA-256（文件）：`f038a55dcd51d61fa92d8694e1fd35b8bc34fdf716785fb8df358651d5168a34`
- 后台预期 content_hash：`c343d104f26ec1f9d83e845bc7a8baa4c49ef907254788a2b6c9ea4a46c8e4ca`
- 推荐生效时间：留空，发布成功时立即生效
- 推荐发布顺序：4

## 串行发布顺序

1. `terms_of_service`
2. `refund_policy`
3. `digital_delivery_policy`
4. `purchase_notice`

每份协议完成草稿预览、发布、`/api/legal/current` 只读核对和旧版本归档确认后，才能继续下一份。`privacy_policy` 不在本发布包中。
