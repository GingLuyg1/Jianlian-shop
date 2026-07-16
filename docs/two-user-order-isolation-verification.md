# 双账号订单隔离应用层验证

## 目标与边界

本验证只检查两个普通 `authenticated` 用户之间的订单隔离。不要使用管理员账号充当用户 B，不测试真实支付，不复制或传播任何登录凭证。

- 用户 A：`b0a56264-aa77-4409-b91e-74a1442cf60e`
- 用户 B：从 `docs/two-user-order-isolation-readonly.sql` 的候选查询中人工选择另一个 `profiles.role = 'user'` 的账号
- 管理员 `d26b5042-d124-40f1-82ea-e00da7ad2ce4` 不参与双普通用户验证

## 当前接口契约

| 能力 | 方法与路径 | 登录 | 归属检查 | 非本人当前响应 |
| --- | --- | --- | --- | --- |
| 用户订单列表 | `GET /api/orders` | 必须 | `listUserOrders()` 固定 `.eq("user_id", user.id)` | `200`，列表中不含他人订单 |
| 用户订单详情 | `GET /api/orders/:orderNo` | 必须 | `getUserOrderByNo()` 同时匹配 `user_id` 和 `order_no` | `404`，当前响应没有 `code` |
| 用户取消订单（真实 API） | `PATCH /api/orders/:orderNo` | 必须 | 调用 RPC 前先使用 `getUserOrderByNo()` 校验归属 | `404`，当前响应没有 `code` |
| 旧详情页取消请求 | `POST /api/orders/:orderNo/cancel` | 必须 | 当前没有对应 App Router | `404` 路由不存在，不能用于本次权限结论 |
| 交付内容 | `GET /api/orders/:orderNo/delivery` | 必须 | `get_order_delivery_for_user()` 内以 `order_no` 和 `auth.uid()` 查询 | 当前实现为 `400`，没有 `code` |
| 履约明细 | `GET /api/orders/:orderNo/fulfillment` | 必须 | `get_order_fulfillment_for_user()` 内以 `order_no` 和 `auth.uid()` 查询 | 当前实现为 `400`，没有 `code` |

取消请求体：

```json
{
  "reason": "two-user-isolation-test"
}
```

取消成功响应为 `200`，结构为 `{ "ok": true, "result": { ... } }`。首次成功的 `result.code` 为 `CANCELLED`。RPC 的重复取消结果为 `ALREADY_CANCELLED`，但 API 会先执行状态检查，当前重复请求通常返回 `400 ORDER_NOT_CANCELLABLE`。已支付或其他不可取消状态同样返回 `400 ORDER_NOT_CANCELLABLE`。

## 安全记录规则

开发者工具只记录以下内容：

- 请求路径，不包含 Cookie 或查询中的敏感值
- HTTP 状态
- Response JSON
- `request_id`（接口存在时）
- 当前窗口登录的是用户 A 还是用户 B

不要复制完整 cURL。不要复制或发送 `Cookie`、`Authorization`、`access_token`、刷新令牌或完整请求头。当前这些订单接口并非都返回 `request_id`，没有时记录“未提供”。

## 准备步骤

1. 确认本地应用连接 `Jianlian-shop-test`，不要连接正式项目。
2. 在测试库人工执行只读文件中的“用户 B 候选”查询，选择普通且状态正常的第二个账号。
3. 浏览器普通窗口登录用户 A；浏览器无痕窗口登录用户 B。两个窗口必须保持独立 Cookie。
4. 两个窗口都打开开发者工具 Network，启用 Preserve log。
5. 分别选择可正常下单的低价值测试商品，创建未支付订单。不要进入真实支付。
6. 记录 `A_ORDER_NO`、`B_ORDER_NO`，将它们和用户 B UUID 填入只读核对 SQL。

## 场景 1：用户 A 创建未支付订单

- 操作：用户 A 从 checkout 提交测试订单。
- 接口：`POST /api/orders`。
- 预期 HTTP：`200`。
- 预期错误码：无；响应应包含新订单编号。
- 数据库预期：订单 `user_id` 为用户 A，`status = pending_payment`，`payment_status = unpaid`，且至少有一条订单项。
- 失败记录：路径、状态、Response JSON、request_id、用户 A、商品 ID。

## 场景 2：用户 B 创建未支付订单

- 操作：用户 B 在无痕窗口创建另一笔测试订单。
- 接口：`POST /api/orders`。
- 预期 HTTP：`200`。
- 预期错误码：无。
- 数据库预期：订单 `user_id` 为用户 B，状态为待支付，且订单编号不同于用户 A。
- 失败记录：路径、状态、Response JSON、request_id、用户 B、商品 ID。

## 场景 3：用户 A 查看自己的订单列表

- 操作：用户 A 打开账户订单页，并在 Network 查看列表请求。
- 接口：`GET /api/orders?page=1&pageSize=20`。
- 预期 HTTP：`200`。
- 预期错误码：无。
- 数据库预期：响应含 `A_ORDER_NO`，不含 `B_ORDER_NO`。
- 失败记录：路径、状态、响应中的订单编号列表、当前用户。

## 场景 4：用户 A 查看自己的订单详情

- 操作：用户 A 打开自己的订单详情。
- 接口：`GET /api/orders/A_ORDER_NO`。
- 预期 HTTP：`200`。
- 预期错误码：无。
- 数据库预期：返回订单归属用户 A，商品快照和状态与数据库一致。
- 失败记录：路径、状态、Response JSON、当前用户。

## 场景 5：用户 A 请求用户 B 的订单详情

- 操作：在用户 A 窗口地址栏或 Console 使用同源 `fetch('/api/orders/B_ORDER_NO')` 发起请求；不要附加手工 Cookie 或 Authorization。
- 接口：`GET /api/orders/B_ORDER_NO`。
- 预期 HTTP：`404`。
- 预期错误码：当前实现未提供结构化 `code`；安全等价响应为“订单不存在或无权查看”。
- 数据库预期：B 订单无变化。
- 失败记录：路径、状态、Response JSON、当前用户。若返回订单或任何 B 的联系方式，立即停止测试并按 P0 处理。

## 场景 6：用户 A 请求用户 B 的交付内容

- 操作：用户 A 同源请求 B 的 delivery 和 fulfillment 两个端点。
- 接口：`GET /api/orders/B_ORDER_NO/delivery`；`GET /api/orders/B_ORDER_NO/fulfillment`。
- 预期 HTTP：当前代码两个端点均为 `400`，不是目标统一的 `404`。
- 预期错误码：当前实现未提供 `code`；响应不得包含 delivery、content、masked_content 或 B 的个人信息。
- 数据库预期：订单和交付记录无变化；不得把他人的交付记录标记为已查看。
- 失败记录：两条路径、状态、Response JSON、当前用户。任何交付内容泄露均为 P0。

## 场景 7：用户 A 尝试取消用户 B 的订单

- 操作：在用户 A 窗口执行同源请求：

```js
fetch('/api/orders/B_ORDER_NO', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason: 'two-user-isolation-test' })
}).then(async (response) => ({ status: response.status, body: await response.json() }))
```

- 接口：`PATCH /api/orders/B_ORDER_NO`。
- 预期 HTTP：`404`。
- 预期错误码：当前 API 预校验分支未提供 `code`；不得透露 B 订单存在。
- 数据库预期：B 订单仍为 `pending_payment/unpaid`，`cancelled_at` 和 `reservation_released_at` 不变，库存预留不释放。
- 失败记录：路径、状态、Response JSON、当前用户。不要粘贴 Console 中的完整 Request 对象。

## 场景 8：用户 B 查看自己的订单

- 操作：用户 B 在无痕窗口打开订单列表和 B 订单详情。
- 接口：`GET /api/orders`；`GET /api/orders/B_ORDER_NO`。
- 预期 HTTP：均为 `200`。
- 预期错误码：无。
- 数据库预期：B 能看到自己的订单，不出现 A 的订单。
- 失败记录：路径、状态、订单编号列表、当前用户。

## 场景 9：用户 B 取消自己的未支付订单

- 操作：优先用 `PATCH /api/orders/B_ORDER_NO` 和上述请求体。当前详情页“取消订单”按钮请求不存在的 `/cancel` 路由，因此 UI 点击得到 404 时不能判定权限失败。
- 接口：`PATCH /api/orders/B_ORDER_NO`。
- 预期 HTTP：`200`。
- 预期响应码：`result.code = CANCELLED`。
- 数据库预期：B 订单为 `cancelled`，`cancelled_at` 非空，`reservation_released_at` 非空；普通/SKU/数字预留按既有 RPC 只释放一次。
- 失败记录：路径、状态、Response JSON、当前用户，以及只读 SQL 的取消字段结果。

## 场景 10：用户 A 再次访问用户 B 已取消订单

- 操作：用户 A 再次请求 B 订单详情、delivery 和 fulfillment。
- 接口：与场景 5、6 相同。
- 预期 HTTP：详情 `404`；delivery 和 fulfillment 按当前实现为 `400`。
- 预期错误码：当前实现均没有统一 `ORDER_NOT_FOUND` code。
- 数据库预期：B 订单保持 `cancelled`，释放时间不再变化，不产生第二次库存释放。
- 失败记录：路径、状态、Response JSON、当前用户、两次只读核对中的释放时间。

## 通过标准

- A 的列表没有 B 的订单。
- A 无法读取 B 的详情、交付内容或履约明细。
- A 无法取消 B 的订单。
- B 可以查看自己的订单并通过真实 `PATCH` API 取消自己的未支付订单。
- 取消后库存只释放一次，重复读取不会改变状态。
- 所有越权响应都不泄露订单存在性、用户 ID、联系方式、支付记录或交付内容。

## 已知差异与停止条件

1. 详情页取消按钮当前调用不存在的 `POST /api/orders/:orderNo/cancel`，真实 API 是 `PATCH /api/orders/:orderNo`。因此 UI 取消尚不能作为通过证据。
2. 详情和取消的 404 响应、交付端点的 400 响应当前没有统一 `ORDER_NOT_FOUND` code。
3. delivery/fulfillment 的非本人状态码当前是 400。它们在 RPC 层按 `auth.uid()` 隔离，但仍需后续单独统一为 404。
4. 若 A 获得 B 的任何订单、联系方式、支付或交付数据，立即停止，不继续取消或支付操作。

