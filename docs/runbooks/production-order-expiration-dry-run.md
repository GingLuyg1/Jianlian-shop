# 正式订单过期 API 人工 dry-run 手册

本手册根据当前仓库代码固定正式 dry-run 的请求和响应契约。它不授权调用 API，也不包含任何真实 secret、正式域名或环境变量值。

## 正式执行结果（已通过）

- 执行主体：用户人工执行。
- 正式项目：Jianlian-shop / `qvbovrvybirscaurwuov`。
- 正式站：`https://jianlian-shop.vercel.app`。
- 请求：`GET /api/internal/orders/expire?dry_run=true&limit=10`。
- 结果：HTTP 200、`success=true`、`dry_run=true`、`candidate_count=0`、`candidates=[]`。
- 已确认正式 `CRON_SECRET`、Supabase URL、管理员客户端和列表 RPC 链路正常；未记录任何变量值。
- 已确认 dry-run 未修改订单、库存或支付会话。
- 因没有候选，本次执行到此停止，没有执行真实 `limit=1`。

下一阶段受控验证方案记录在 `docs/CURRENT_TASK.md`。必须先创建或等待一个明确测试订单自然过期，并重新取得 dry-run 与真实 `limit=1` 的独立授权。

## 操作边界

- 只允许在获得单独明确授权后执行 dry-run。
- 不执行非 dry-run 请求，不执行 `limit=1` 真实过期，不创建 Cron，不安装扩展。
- 不在命令历史、截图、日志、文档或聊天中记录 secret。
- 正式站点域名、正式环境和 `CRON_SECRET` 未完成二次确认时停止。

## 代码确认的接口契约

### URL 与方法

- 路径：`/api/internal/orders/expire`
- GET：正式支持，通过 query string 读取 `dry_run` 与 `limit`。
- POST：正式支持，通过 JSON body 读取 `dry_run`、`limit` 与 `reason`。
- 人工首次 dry-run 推荐 GET，便于目视确认 URL 中明确包含 `dry_run=true`。

### `dry_run` 参数

代码会先去除首尾空白并转换为小写，以下值解析为 true：

- `1`
- `true`
- `yes`

因此 `1` 和 `true` 均受支持。大小写变体也会被接受。其他值、空值或缺失参数均解析为 false，并会进入真实处理分支。为降低误操作风险，人工执行固定使用精确字符串 `dry_run=true`，不得省略或改名。

### `limit` 参数

| 模式 | 默认值 | 最小值 | 最大值 | 处理规则 |
| --- | ---: | ---: | ---: | --- |
| dry-run | 10 | 1 | 50 | 有效数字向下取整并夹紧；无效或空值回退 10 |
| 非 dry-run | 50 | 1 | 200 | 有效数字向下取整并夹紧；无效或空值回退 50 |

首次 dry-run 建议显式使用 `limit=10`。本手册不授权非 dry-run 请求。

### 认证

服务端依次选取第一个非空环境变量作为期望 secret：

1. `CRON_SECRET`
2. `ORDER_EXPIRATION_JOB_SECRET`
3. `INTERNAL_JOB_SECRET`

请求认证头的读取优先级为：

1. `x-internal-job-secret`
2. `Authorization`

推荐只发送一个头：

```text
Authorization: Bearer <CRON_SECRET>
```

`Bearer` 匹配不区分大小写，后面必须至少有一个空白字符，再跟完整 secret。若同时发送两个认证头，代码会优先使用 `x-internal-job-secret`；错误的内部头会导致正确的 Bearer 也不生效，因此不要同时发送。

## PowerShell GET 请求模板

以下内容只是模板，不得预填真实域名或 secret，也不得在未授权时运行：

```powershell
$productionBaseUrl = "https://<正式站点域名>"
$secretSecure = Read-Host "输入正式 CRON_SECRET（不会回显）" -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)

try {
  $secretPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  $headers = @{
    Authorization = "Bearer $secretPlain"
    Accept = "application/json"
  }
  $uri = "$productionBaseUrl/api/internal/orders/expire?dry_run=true&limit=10"

  $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  $response | ConvertTo-Json -Depth 6
}
finally {
  if ($secretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }
  Remove-Variable secretPlain, secretSecure, secretPointer, headers -ErrorAction SilentlyContinue
}
```

不得把 secret 直接写入脚本文件、命令参数、环境变量赋值示例或执行记录。

## 可选 POST 模板

仅当执行人明确选择 POST 时使用；认证变量的安全读取方式与 GET 模板相同：

```powershell
$uri = "$productionBaseUrl/api/internal/orders/expire"
$body = @{ dry_run = $true; limit = 10 } | ConvertTo-Json
$response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/json" -Body $body
$response | ConvertTo-Json -Depth 6
```

## HTTP 200 成功响应

实际字段为：

```json
{
  "success": true,
  "requestId": "<request-id>",
  "dry_run": true,
  "candidate_count": 1,
  "candidates": [
    { "order_id_summary": "12345678...abcdef" }
  ]
}
```

- `candidate_count` 等于返回候选数组长度，并且不超过生效 limit。
- 响应不会返回完整 `order_id`。UUID 长度超过 16，代码只返回前 8 位、三个点和末 6 位。
- 响应不得包含订单号、用户信息、地址、TxHash、secret 或环境变量值。

## 错误响应

### HTTP 401：认证失败

```json
{ "error": "无权执行订单超时任务" }
```

### HTTP 503：服务端任务 secret 未配置

```json
{ "error": "订单超时任务密钥未配置" }
```

### HTTP 503：列表 RPC 不可用

```json
{
  "success": false,
  "requestId": "<request-id>",
  "dry_run": true,
  "readiness_code": "CODE_OR_DB_NOT_READY",
  "error_code": "ORDER_EXPIRATION_RPC_UNAVAILABLE",
  "error": "订单过期候选读取失败，请检查数据库函数是否已部署。"
}
```

### HTTP 429：限流

```json
{
  "error": "内部任务触发过于频繁，请稍后再试。",
  "code": "RATE_LIMITED",
  "retryAfter": 300
}
```

实际 `retryAfter` 取决于剩余窗口。响应还包含 `Retry-After`、`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`。当前 `internal_task` 策略为每 5 分钟最多 3 次，路由使用固定任务限流键。

服务端数据库客户端缺失或其他未捕获运行错误可能返回其他 HTTP 5xx，响应结构不保证。任何非 200 都必须停止。

## Dry-run 无写入确认

当 `dry_run` 解析为 true 时：

1. 路由只调用 `listExpirableUnpaidOrdersDryRun(limit)`。
2. helper 只调用 `list_expirable_unpaid_orders`。
3. Postcheck 确认该列表 RPC 的部署定义只执行 SELECT。
4. 路由在返回 dry-run JSON 后不会进入 `processExpiredOrders()`。
5. 因此不会调用 `expire_unpaid_order`，不会更新订单、库存或支付会话。

该请求会增加应用进程内的限流计数；这不是数据库或业务数据写入。

## 执行后判断与停止条件

- HTTP 非 200：停止，不连续重试。
- `success` 或 `dry_run` 不为 true：停止。
- 缺少 `requestId`，候选数与数组长度不一致，或候选超过 limit：停止。
- 响应出现完整 order UUID 或其他敏感信息：停止并保护证据。
- 观察到订单、库存或支付会话变化：立即停止。
- `candidate_count=0`：记录成功且无候选，停止，不进入真实验证。
- `candidate_count>0`：只保存脱敏摘要，另行只读复核并申请 `limit=1` 授权。
- dry-run 成功不授权 `limit=1`、环境变量修改、部署、扩展安装或 Cron。
