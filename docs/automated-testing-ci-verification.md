# 自动化测试与 CI 验收报告

## 现有测试能力

- `package.json` 当前没有 `test` / `npm test` 脚本。
- 已有 Playwright 端到端测试入口：`tests/e2e/home.spec.ts`，对应脚本为 `test:e2e` 和 `test:e2e:ui`。
- 已有 `typecheck` 和 `build` 脚本，可用于基础质量门禁。
- 本次新增 Node.js 原生测试，不引入新依赖，不修改依赖版本。
- 本次新增 GitHub Actions CI，执行依赖安装、Node 原生回归测试、类型检查和构建。

## 新增测试文件

- `tests/regression/core-logic.test.mjs`
- `tests/regression/source-contract.test.mjs`

## 测试环境隔离方式

- 新增 `.env.test.example`，仅包含占位符和测试环境变量名称。
- CI 不提交、不读取真实 `.env.local`。
- CI 不执行 Supabase migration，不写生产数据库。
- CI 不调用真实支付 Provider、邮件、短信或外部通知。
- 缺少真实 Supabase 配置时，仅运行纯逻辑与源码契约测试；集成测试应在专用测试库配置后再启用。

## 商品保存测试结果

覆盖范围：

- 商品表单值规范化：字符串 trim、数字字符串转 number、空字符串归一为 `null`。
- 商品 dirty 判断：规范化后比较，避免 `"10"` 与 `10`、`""` 与 `null` 的误报。
- 保存成功后 dirty 归零的纯逻辑路径。
- 静态契约检查管理员商品 API 必须存在服务端管理员校验。

未覆盖：

- 未连接真实测试数据库，因此未执行 Supabase update 影响 0 行、数据库返回空记录的集成测试。
- 商品编辑弹窗的浏览器交互需要后续 Playwright 用例覆盖。

## 多 SKU 测试结果

覆盖范围：

- 1、2、3 个规格组的笛卡尔积生成。
- 同组重复规格值检测。
- 规格值顺序变化时使用稳定组合键，避免重复 SKU。
- 重新生成组合时保留已有 SKU 的 ID、价格、库存和状态。
- 新组合使用默认 SKU 字段。
- 单规格商品逻辑兼容。

未覆盖：

- 真实后台 SKU 保存到 Supabase 的集成测试。
- 已有订单引用 SKU 的数据库级停用流程。

## 订单与支付测试结果

覆盖范围：

- 订单金额由服务端商品价格计算，前端价格不参与可信总额。
- `client_request_id` 幂等模型：同一用户同一请求只返回同一订单。
- 订单 API 源码契约：白名单参数不接受前端价格和总金额。
- 订单创建 RPC 源码契约：读取产品/SKU 价格并具备用户请求幂等索引。
- 支付 Provider 占位适配器不得返回假二维码、假地址或模拟成功。
- 支付回调必须走 Provider 验签、解析和统一支付完成服务。
- 重复支付完成保持幂等，金额或币种不一致拒绝成功。

未覆盖：

- 真实 Provider 回调验签需要接入具体平台后用沙箱回调测试。
- 充值入账 RPC 的真实并发事务测试需要专用测试 Supabase。

## 库存与权限测试结果

覆盖范围：

- 数字库存按 `product_id + sku_id` 分配。
- 不同 SKU 库存隔离。
- `available -> reserved -> delivered` 状态流转。
- 已交付库存不能恢复为可用。
- 库存不足返回明确错误。
- 未登录访问管理员接口返回 401，普通用户返回 403。
- 用户只能访问自己的资源；伪造余额修改和伪造支付成功被拒绝。
- 源码契约检查数字库存 migration 包含 SKU 过滤条件。

未覆盖：

- 真实 RLS 策略需要连接测试 Supabase 执行权限回归。
- 数字库存原文脱敏日志需结合后台操作和审计日志做 E2E 检查。

## GitHub Actions 配置

新增 `.github/workflows/ci.yml`：

1. `actions/checkout`
2. `actions/setup-node`，Node.js 20
3. `npm ci`
4. `node --test tests/regression/*.test.mjs`
5. `npm run typecheck`
6. `npm run build`

CI 触发：

- `pull_request`
- `push` 到 `main`

安全约束：

- 不执行 migration。
- 不部署服务器。
- 不打印生产 Secrets。
- 不调用真实支付或通知服务。

## 未覆盖模块

- 真实浏览器商品保存交互。
- 真实 Supabase RLS 权限策略。
- 真实支付 Provider 沙箱回调。
- 生产数据库 migration 执行结果。
- 自动发货完整端到端履约。
- 余额支付如需启用，还需要专用事务测试。

## 无法自动测试项目

- 真实支付到账。
- 第三方 Provider IP 白名单和签名细节。
- 生产环境数据库权限和备份回滚。
- 管理员手工审核流程的业务判断。

## 发现并修复的问题

- 项目此前没有 GitHub Actions CI。
- 项目此前没有无需外部服务的核心逻辑回归测试。
- Windows PowerShell 不展开 `node --test tests/regression/*.test.mjs` 通配符，本地使用显式文件列表；CI 在 Ubuntu shell 中可正常展开。
- 静态契约测试已按当前订单 RPC 和支付回调服务实现调整。

## 仍存在的问题

- `package.json` 仍无统一 `test` 脚本；本次按要求未修改依赖和脚本。
- 当前测试以纯逻辑和源码契约为主，数据库集成测试需要独立测试 Supabase 环境。
- GitHub Actions 需要推送后由 GitHub 实际运行确认。
