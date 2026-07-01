# 错误代码参考

统一错误响应建议格式：

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_UPDATE_FAILED",
    "message": "商品保存失败，请稍后重试。",
    "request_id": "req_xxx"
  }
}
```

## 错误域

```text
AUTH
PERMISSION
VALIDATION
PRODUCT
CATEGORY
SKU
ORDER
PAYMENT
RECHARGE
REFUND
BALANCE
INVENTORY
DELIVERY
DATABASE
PROVIDER
SYSTEM
```

## 常用代码

| 代码 | 用户提示 |
| --- | --- |
| AUTH_REQUIRED | 请先登录。 |
| PERMISSION_DENIED | 无权限执行此操作。 |
| VALIDATION_FAILED | 提交内容不完整或格式不正确。 |
| PRODUCT_NOT_FOUND | 商品不存在或已下架。 |
| PRODUCT_UPDATE_FAILED | 商品保存失败，请稍后重试。 |
| PRODUCT_UPDATE_NO_ROWS | 未找到需要更新的商品。 |
| SKU_SAVE_FAILED | SKU 保存失败，请检查规格信息。 |
| ORDER_CREATE_FAILED | 订单创建失败，请稍后重试。 |
| PAYMENT_PROVIDER_NOT_CONFIGURED | 支付方式尚未配置。 |
| PAYMENT_SIGNATURE_INVALID | 支付回调校验失败。 |
| BALANCE_UPDATE_FAILED | 余额更新失败，请联系管理员。 |
| INVENTORY_RESERVATION_FAILED | 库存预留失败，请稍后重试。 |
| DELIVERY_FAILED | 交付处理失败，请联系客服。 |
| DATABASE_UNAVAILABLE | 数据库暂时不可用，请稍后重试。 |
| INTERNAL_ERROR | 系统繁忙，请稍后重试。 |

## 安全规则

- 不向前端返回 Supabase 原始错误。
- 不向前端返回 Provider 原始错误。
- 不暴露服务器路径、SQL、Token、密钥和数字库存内容。
- 用户提示和内部错误摘要分离。
- 每个错误响应尽量携带 `request_id`，便于后台追踪。
