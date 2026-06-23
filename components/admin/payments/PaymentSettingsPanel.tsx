"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PAYMENT_CHANNELS, type PaymentChannelConfig } from "@/lib/payments/admin-payment-types";

type Payload = { channels?: PaymentChannelConfig[]; error?: string; message?: string; needsMigration?: boolean };

function fallbackChannels(): PaymentChannelConfig[] {
  return PAYMENT_CHANNELS.map((item, index) => ({
    id: item.id,
    channel: item.id,
    enabled: false,
    display_name: item.label,
    min_amount: 0,
    fee_rate: 0,
    currency: item.id.startsWith("usdt") ? "USDT" : "CNY",
    network: item.network || null,
    sort_order: (index + 1) * 10,
    provider_name: null,
    api_url: null,
    merchant_id_masked: null,
    app_id_masked: null,
    callback_url: null,
    timeout_minutes: 30,
    secret_status: "未配置",
    secret_last4: null,
    updated_at: null,
  }));
}

function getClientErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const text = String(error).replace(/^Error:\s*/i, "").trim();
    if (text) return text;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function PaymentSettingsPanel() {
  const [channels, setChannels] = useState<PaymentChannelConfig[]>([]);
  const [secrets, setSecrets] = useState<Record<string, { secret_key?: string; signing_key?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/payment-channels", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as Payload | null;
        if (!mounted) return;
        if (!response.ok) {
          setMessage(payload?.error ?? "支付设置读取失败");
          setChannels(fallbackChannels());
          return;
        }
        setChannels(payload?.channels?.length ? payload.channels : fallbackChannels());
        if (payload?.error) setMessage(payload.error);
      })
      .catch(() => {
        if (!mounted) return;
        setMessage("支付设置读取失败");
        setChannels(fallbackChannels());
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const updateChannel = (channel: string, patch: Partial<PaymentChannelConfig>) => {
    setChannels((items) => items.map((item) => (item.channel === channel ? { ...item, ...patch } : item)));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/payment-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: channels.map((channel) => ({
            channel: channel.channel,
            enabled: channel.enabled,
            display_name: channel.display_name,
            min_amount: channel.min_amount,
            fee_rate: channel.fee_rate,
            currency: channel.currency,
            network: channel.network,
            sort_order: channel.sort_order,
            provider_name: channel.provider_name,
            api_url: channel.api_url,
            merchant_id: channel.merchant_id_masked?.startsWith("****") ? undefined : channel.merchant_id_masked,
            app_id: channel.app_id_masked?.startsWith("****") ? undefined : channel.app_id_masked,
            callback_url: channel.callback_url,
            timeout_minutes: channel.timeout_minutes,
            secret_key: secrets[channel.channel]?.secret_key || undefined,
            signing_key: secrets[channel.channel]?.signing_key || undefined,
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) throw new Error(payload?.error ?? "支付设置保存失败");
      setChannels(payload?.channels?.length ? payload.channels : channels);
      setSecrets({});
      toast.success(payload?.message ?? "支付设置已保存");
    } catch (error) {
      const text = getClientErrorMessage(error, "支付设置保存失败");
      setMessage(text);
      toast.error(text);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">正在读取支付设置...</div>;
  }

  return (
    <div className="flex min-h-full flex-col">
      {message ? <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div> : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {channels.map((channel) => (
          <div key={channel.channel} className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">{channel.display_name || channel.channel}</div>
                <div className="text-xs text-slate-500">密钥状态：{channel.secret_status}{channel.secret_last4 ? `（****${channel.secret_last4}）` : ""}</div>
              </div>
              <Switch checked={channel.enabled} onCheckedChange={(checked) => updateChannel(channel.channel, { enabled: checked })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="显示名称"><Input value={channel.display_name} onChange={(event) => updateChannel(channel.channel, { display_name: event.target.value })} /></Field>
              <Field label="最低金额"><Input type="number" min={0} value={channel.min_amount} onChange={(event) => updateChannel(channel.channel, { min_amount: Number(event.target.value) })} /></Field>
              <Field label="手续费率"><Input type="number" min={0} step={0.0001} value={channel.fee_rate} onChange={(event) => updateChannel(channel.channel, { fee_rate: Number(event.target.value) })} /></Field>
              <Field label="支付币种"><Input value={channel.currency} onChange={(event) => updateChannel(channel.channel, { currency: event.target.value })} /></Field>
              <Field label="网络"><Input value={channel.network ?? ""} disabled={channel.channel === "alipay" || channel.channel === "wechat"} onChange={(event) => updateChannel(channel.channel, { network: event.target.value || null })} /></Field>
              <Field label="排序"><Input type="number" value={channel.sort_order} onChange={(event) => updateChannel(channel.channel, { sort_order: Number(event.target.value) })} /></Field>
              <Field label="Provider 名称"><Input value={channel.provider_name ?? ""} onChange={(event) => updateChannel(channel.channel, { provider_name: event.target.value || null })} /></Field>
              <Field label="API 地址"><Input value={channel.api_url ?? ""} onChange={(event) => updateChannel(channel.channel, { api_url: event.target.value || null })} /></Field>
              <Field label="商户号"><Input value={channel.merchant_id_masked ?? ""} onChange={(event) => updateChannel(channel.channel, { merchant_id_masked: event.target.value || null })} /></Field>
              <Field label="App ID"><Input value={channel.app_id_masked ?? ""} onChange={(event) => updateChannel(channel.channel, { app_id_masked: event.target.value || null })} /></Field>
              <Field label="回调地址"><Input value={channel.callback_url ?? ""} onChange={(event) => updateChannel(channel.channel, { callback_url: event.target.value || null })} /></Field>
              <Field label="超时时间"><Input type="number" min={1} value={channel.timeout_minutes} onChange={(event) => updateChannel(channel.channel, { timeout_minutes: Number(event.target.value) })} /></Field>
              <Field label="支付密钥（留空不修改）"><Input type="password" value={secrets[channel.channel]?.secret_key ?? ""} onChange={(event) => setSecrets((value) => ({ ...value, [channel.channel]: { ...value[channel.channel], secret_key: event.target.value } }))} /></Field>
              <Field label="签名密钥（留空不修改）"><Input type="password" value={secrets[channel.channel]?.signing_key ?? ""} onChange={(event) => setSecrets((value) => ({ ...value, [channel.channel]: { ...value[channel.channel], signing_key: event.target.value } }))} /></Field>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex shrink-0 justify-end border-t pt-3">
        <Button disabled={saving} onClick={save}>{saving ? "保存中..." : "保存支付设置"}</Button>
      </div>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
