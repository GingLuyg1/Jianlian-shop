# Production release 外部只读验收

本清单不授权部署。只能在另行授权的 switch 完成后执行；不得创建订单、点击创建充值、调用 Provider query、运行 reconciliation/worker 或修改 DB。不得进入或检查受保护的备用应用目录。HTTP 加载通过不等于 UI 验收通过。

## 运行身份

明确指定本次已批准 **exact candidate SHA**，与部署记录核对，不能自动把当前运行版本当作预期版本。

```bash
EXPECTED_RELEASE=/www/releases/jianlian-shop-<approved_exact_full_sha>
PM2_HOME=/root/.pm2 pm2 jlist | node -e '
let input=""; process.stdin.on("data", c => input+=c);
process.stdin.on("end", () => {
  const app=JSON.parse(input).find(a => a.name === "jianlian-shop");
  if (!app) process.exit(1);
  const e=app.pm2_env || {}, fs=require("fs"), path=require("path");
  const expected=process.argv[1];
  const procCwd=fs.realpathSync(`/proc/${app.pid}/cwd`);
  const script=fs.realpathSync(e.pm_exec_path);
  const next=fs.realpathSync(path.join(expected,"node_modules/next/dist/bin/next"));
  const pass=e.status === "online" && e.pm_cwd === expected && procCwd === expected
    && script === next && script.startsWith(expected + "/");
  console.log(JSON.stringify({pid:app.pid,status:e.status,cwd:e.pm_cwd,procCwd,script,pass}));
  process.exit(pass ? 0 : 1);
});' "$EXPECTED_RELEASE"
```

只输出允许的 runtime metadata，不直接打印完整 jlist/env；确认主 PM2_HOME=/root/.pm2，3001 listener 对应该 PID。

## HTTP 与 UI

```bash
curl --connect-timeout 10 --max-time 20 -sS -o /dev/null -w 'LOCAL_HEALTH=%{http_code}\n' http://127.0.0.1:3001/api/health
for endpoint in /api/health / /login /products/account-recharge; do
  curl --connect-timeout 10 --max-time 20 -sS -o /dev/null -w "$endpoint=%{http_code}\n" "https://jianlian.shop$endpoint"
done
curl --connect-timeout 10 --max-time 20 -fsS https://jianlian.shop/api/recharges/channels | node -e '
let input=""; process.stdin.on("data", c=>input+=c);
process.stdin.on("end",()=>{
 const codes=JSON.parse(input).channels.map(c=>c.code);
 const pass=!codes.includes("alipay") && !codes.includes("wechat") && codes.includes("usdt_bep20");
 console.log(JSON.stringify({publicChannelCodes:codes,pass})); process.exit(pass?0:1);
});'
```

要求各 HTTP=200。授权浏览器只读查看充值页无白屏/异常、金额输入和渠道展示正常，不点击“创建充值”，不打开已有支付状态轮询页面。要求 Alipay=false、WeChat=false、USDT-BEP20=true。另由已授权只读 DB 通道核实 canonical payment_channels enabled 状态；public 隐藏不能单独证明 enabled=false。禁止把凭据拼入命令、输出或日志。

## Reconciliation 与零业务动作

```bash
systemctl show jianlian-snpay-reconciliation.timer -p LoadState -p ActiveState -p UnitFileState
systemctl show jianlian-snpay-reconciliation.service -p LoadState -p ActiveState -p UnitFileState
```

本次仅 app deploy：预期 reconciliation service/timer 未安装、未 enabled、未 active；存在意外加载/启动时验收失败，不能自行安装、停用或修改。其他支付 timer 的既有 pin/状态须与部署前记录一致，不改 unit。只加载 release 中 systemd 文件不等于安装。

以部署前安全只读 snapshot 为基线，部署后通过已有授权只读 DB 通道核对 payment_sessions、account_recharges、balance_transactions 及余额；不记录用户身份/完整订单 ID/secret。如既有后台工作产生合法变化，必须区分归因，不能宣称所有行绝对不变。核对本次操作无新增 payment/recharge、无 balance/ledger write、真实 Provider query=0；不能用新的 query 或 completion 证明没有 mutation。第三笔已完成 canary不得再处理。

## 判定与 save 行为

发布脚本在内置 localhost health/public 首页/login 全通过后自动 save；本外部清单不是自动 save 的前置条件，也不执行第二次 save。成功 switch/rollback 有 PM2_SAVE=PASS；成功自动恢复有 RECOVERY_PM2_SAVE=PASS。save 失败必须按实际运行 cwd 复查，不能误报已恢复持久化。

任一身份、健康、支付页、渠道、DB 归因或 systemd 检查失败即停止验收；只有既有授权明确允许时才能调用既定 rollback。rollback 是一次新的 PM2 切换，会在成功验证后 save，不属于本只读清单。切勿自动改渠道、DB 或 unit 作为补救。
