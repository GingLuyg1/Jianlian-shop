# 六号易 V1：参考插件、官方协议与 Jianlian 实现对照

资料：用户提供的 `epay_reference_plugins.zip`（`epay_wx/`、`epay_ali/` 全部 PHP 文件）及[六号易 V1 官方文档](https://liuhao.net/doc/v1_legacy_api.html)。参考插件用于核对协议，不作为安全实现范本。本文件不证明 Production 已切换或验证 `submit.php` 实付。

| 字段 / 行为 | 两个插件的 `submit.php` | 官方 V1 | Jianlian 现行 `mapi.php` | 可选 `submit.php` |
| --- | --- | --- | --- | --- |
| `pid` | 商户号 | 必填 | 服务端配置 | 服务端配置 |
| `type` | `wxpay` / `alipay` | submit 可选、mapi 必填 | 必填 | 显式填写 |
| `out_trade_no` | 插件订单号 | 商户订单号 | 统一 `sessionNo` | 同一 `sessionNo` |
| `notify_url` | 公开 GET notify hook | 异步通知 URL | `https://<site>/api/payments/callback/<channel>` | 同一 URL |
| `return_url` | 公开 return hook | 页面跳转 URL | `/payment?recharge=` 或 `/payment?order=` | 同一状态页 |
| `name`、`money` | 名称、元金额 | 必填 | 限长名称、本金精确两位小数 | 同一值 |
| `sign`、`sign_type` | MD5 | MD5 签名 | 服务端生成 | 服务端生成，表单携带签名但不携带密钥 |
| `clientip`、`device` | 不提交 | mapi 专属 / mapi 可选 | mapi 提交 | submit 不提交 |
| 支付展示 | 插件浏览器自动提交 | submit GET/POST，推荐 POST；mapi 返回互斥的 `payurl` / `qrcode` / `urlscheme` | 本站按 artifact 展示 | 用户动作触发 POST 表单，六号易展示 |

两个插件的签名过程均为：排除空值及 `sign`、`sign_type`，按键名 ASCII 升序排列，连接未经 URL 编码的 `key=value` 与 `&`，尾随商户密钥计算小写 MD5。Jianlian 创建和回调验签采用同一规范；回调验签另使用恒定时间比较。`submit.php` 和 `mapi.php` 都配置异步 `notify_url`，回调字段和 `TRADE_SUCCESS` / 纯文本 `success` 语义相同；创建方式不改变统一 callback、原子入账或订单完成路径。页面 `return_url` 不是付款证明。

插件虽采用 GET form、字符串拼 HTML、弱比较签名，且未显式检查回调金额 / 商户号 / 已存在会话归属与入账幂等，Jianlian 不复制这些做法。本站使用 DOM 创建的 POST 表单、签名校验、商户及渠道匹配、金额与 session 匹配、统一完成和幂等控制。付款会话先落库，`submitForm` 作为该会话的服务端生成展示信息保存；复用会话不会根据当前环境变量改写其模式。旧 `mapi` 会话继续按原展示信息处理。

`LIUHAOYI_CHECKOUT_MODE` 是服务端可选值 `mapi` / `submit`，缺省为 `mapi`。切换它不修改数据库 schema，也不开放渠道；应另行评审并在受控环境验证。提交模式不调用 mapi 创建，因此只有后续通知 / 查询可提供六号易 `trade_no`。表单可由首次创建动作提交，状态页仅提供手动重开按钮，绝不在返回页加载时自动重提。过期会话不再提供入口。

现有事故中六号易服务端通知返回 5 秒连接超时、Nginx 无请求的证据位于源站应用之前；本地 MD5 或 callback 业务代码不能解释“请求完全未到达 Nginx”。`submit.php` 的隔离 canary 有助于比较六号易内部两种创建路径，但不能据此保证解决通知可达性。上线之前仍需针对 provider 到源站的网络链路做独立验证。
