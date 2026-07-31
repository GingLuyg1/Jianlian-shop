"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  PAYMENT_CHANNELS,
  type PaymentChannelConfig,
} from "@/lib/payments/admin-payment-types";
import {
  expectedProviderForChannel,
  isPaymentChannelReady,
} from "@/lib/payments/manual-channel-readiness.mjs";
import {
  applyPaymentChannelEdit,
  buildPaymentChannelNumericPatch,
  canSavePaymentSettings,
  clearSavedDirtyPaymentChannels,
  createPaymentChannelNumericDrafts,
  mergeSavedPaymentChannel,
  mergeSavedPaymentChannelNumericDrafts,
  PAYMENT_SETTINGS_DATA_SOURCES,
  selectPaymentChannelForSave,
  updatePaymentChannelNumericDraft,
} from "@/lib/payments/payment-settings-state.mjs";
import type {
  PaymentChannelCode,
  PaymentProviderCode,
} from "@/lib/payments/channel-types";

type Payload = {
  channels?: PaymentChannelConfig[];
  error?: string;
  message?: string;
  needsMigration?: boolean;
  readOnly?: boolean;
  dataSource?:
    | "loaded"
    | "fallback"
    | "read_error"
    | "needs_migration";
};

type PaymentSettingsDataSource =
  | "loading"
  | "loaded"
  | "fallback"
  | "read_error"
  | "needs_migration";

function defaultProvider(
  channel: PaymentChannelCode,
): PaymentProviderCode {
  return expectedProviderForChannel(
    channel,
  ) as PaymentProviderCode;
}

function providerLabel(provider: PaymentProviderCode) {
  return {
    generic_api: "Generic API",
    binance: "Binance",
    crypto_address: "Crypto Address",
  }[provider];
}

function fallbackChannels(): PaymentChannelConfig[] {
  return PAYMENT_CHANNELS.map((item, index) => {
    const provider = defaultProvider(item.id);
    const currency = item.id.startsWith("usdt")
      || item.id === "binance_pay"
      ? "USDT"
      : "CNY";

    return {
      id: item.id,
      channel: item.id,
      code: item.id,
      enabled: false,
      configured: false,
      display_name: item.label,
      min_amount: 0,
      minimum_amount: 0,
      fee_rate: 0,
      currency,
      network: item.network || null,
      sort_order: (index + 1) * 10,
      provider_name: provider,
      provider,
      review_mode: "provider",
      maximum_amount:
        currency === "USDT" ? 100000 : 1000000,
      payment_address: null,
      token_contract: null,
      payment_instructions: null,
      api_url: null,
      merchant_id_masked: null,
      app_id_masked: null,
      callback_url: null,
      timeout_minutes: 30,
      secret_status: "未配置",
      secret_last4: null,
      updated_at: null,
    };
  });
}

function getClientErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (error instanceof Error) {
    const text = String(error)
      .replace(/^Error:\s*/i, "")
      .trim();

    if (text) return text;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

function isChannelReady(channel: PaymentChannelConfig) {
  return isPaymentChannelReady({
    channel: channel.channel,
    provider: channel.provider,
    reviewMode: channel.review_mode,
    configured: channel.configured,
    paymentAddress: channel.payment_address,
    tokenContract: channel.token_contract,
    paymentInstructions: channel.payment_instructions,
  });
}

export default function PaymentSettingsPanel() {
  const [channels, setChannels] =
    useState<PaymentChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] =
    useState<PaymentChannelCode | null>(null);
  const [message, setMessage] = useState("");
  const [dataSource, setDataSource] =
    useState<PaymentSettingsDataSource>("loading");
  const [dirtyChannels, setDirtyChannels] =
    useState<Set<PaymentChannelCode>>(
      () => new Set(),
    );
  const [numericDrafts, setNumericDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const channelRevisions = useRef<
    Partial<Record<PaymentChannelCode, number>>
  >({});

  useEffect(() => {
    let mounted = true;

    fetch("/api/admin/payment-channels", {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload =
          (await response.json().catch(() => null)) as
            | Payload
            | null;

        if (!mounted) return;

        if (!response.ok) {
          setMessage(
            payload?.error ?? "支付设置读取失败",
          );
          const fallback = fallbackChannels();
          setChannels(fallback);
          setNumericDrafts(createPaymentChannelNumericDrafts(fallback));
          setDataSource("read_error");
          setDirtyChannels(new Set());
          return;
        }

        const hasServerRows =
          Boolean(payload?.channels?.length);
        const loadedChannels = hasServerRows
          ? payload?.channels ?? []
          : fallbackChannels();
        setChannels(loadedChannels);
        setNumericDrafts(
          createPaymentChannelNumericDrafts(loadedChannels),
        );
        setDirtyChannels(new Set());

        if (payload?.needsMigration) {
          setDataSource("needs_migration");
        } else if (payload?.dataSource === "read_error") {
          setDataSource("read_error");
        } else if (
          payload?.readOnly
          || payload?.dataSource === "fallback"
          || !hasServerRows
        ) {
          setDataSource("fallback");
        } else {
          setDataSource("loaded");
        }

        if (payload?.error) {
          setMessage(payload.error);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setMessage("支付设置读取失败");
        const fallback = fallbackChannels();
        setChannels(fallback);
        setNumericDrafts(createPaymentChannelNumericDrafts(fallback));
        setDataSource("read_error");
        setDirtyChannels(new Set());
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateChannel = (
    channelCode: PaymentChannelCode,
    patch: Partial<PaymentChannelConfig>,
  ) => {
    channelRevisions.current[channelCode] =
      (channelRevisions.current[channelCode] ?? 0) + 1;
    setDirtyChannels((current) => {
      const next = new Set(current);
      next.add(channelCode);
      return next;
    });
    setChannels((items) =>
      items.map((item) => {
        if (item.channel !== channelCode) return item;
        return applyPaymentChannelEdit(
          item,
          patch,
        ) as PaymentChannelConfig;
      }),
    );
  };

  const updateNumericDraft = (
    channelCode: PaymentChannelCode,
    field:
      | "min_amount"
      | "minimum_amount"
      | "maximum_amount"
      | "fee_rate"
      | "sort_order"
      | "timeout_minutes",
    rawValue: string,
  ) => {
    channelRevisions.current[channelCode] =
      (channelRevisions.current[channelCode] ?? 0) + 1;
    setDirtyChannels((current) => {
      const next = new Set(current);
      next.add(channelCode);
      return next;
    });
    setNumericDrafts((current) =>
      updatePaymentChannelNumericDraft(
        current,
        channelCode,
        field,
        rawValue,
      ));
  };

  const saveChannel = async (
    channelCode: PaymentChannelCode,
  ) => {
    const channel = selectPaymentChannelForSave({
      channels,
      dirtyChannelIds: dirtyChannels,
      channelCode,
      dataSource,
      saving: savingChannel !== null,
    }) as PaymentChannelConfig | null;

    if (!channel) {
      setMessage(
        "当前配置不是从服务端完整读取的可编辑数据，请刷新并确认读取成功后再保存。",
      );
      return;
    }

    const requestedRevision =
      channelRevisions.current[channelCode] ?? 0;
    const numericPatch = buildPaymentChannelNumericPatch(
      numericDrafts,
      channel,
    );
    setSavingChannel(channelCode);
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/payment-channels",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channels: [{
              channel: channel.channel,
              code: channel.code,
              enabled: channel.enabled,
              display_name: channel.display_name,
              min_amount: numericPatch.min_amount,
              minimum_amount: numericPatch.minimum_amount,
              fee_rate: numericPatch.fee_rate,
              currency: channel.currency,
              network: channel.network,
              sort_order: numericPatch.sort_order,
              provider_name: channel.provider,
              provider: channel.provider,
              review_mode: channel.review_mode,
              maximum_amount: numericPatch.maximum_amount,
              payment_address: channel.payment_address,
              token_contract: channel.token_contract,
              payment_instructions:
                channel.payment_instructions,
              api_url: channel.api_url,
              merchant_id:
                channel.merchant_id_masked?.startsWith(
                  "****",
                )
                  ? undefined
                  : channel.merchant_id_masked,
              app_id:
                channel.app_id_masked?.startsWith("****")
                  ? undefined
                  : channel.app_id_masked,
              callback_url: channel.callback_url,
              timeout_minutes: numericPatch.timeout_minutes,
              updated_at: channel.updated_at,
            }],
          }),
        },
      );

      const payload =
        (await response.json().catch(() => null)) as
          | Payload
          | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "支付设置保存失败",
        );
      }

      const savedChannel = payload?.channels?.[0];
      if (!savedChannel) {
        throw new Error("服务端未返回已保存的支付渠道。请刷新后重试。");
      }
      const currentRevision =
        channelRevisions.current[channelCode] ?? 0;
      const revisionUnchanged =
        requestedRevision === currentRevision;
      setChannels((current) =>
        mergeSavedPaymentChannel({
          channels: current,
          savedChannel,
          requestedRevision,
          currentRevision,
        }).channels as PaymentChannelConfig[],
      );
      setNumericDrafts((current) =>
        mergeSavedPaymentChannelNumericDrafts({
          drafts: current,
          savedChannel,
          requestedRevision,
          currentRevision,
        }));
      if (revisionUnchanged && savedChannel) {
        setDirtyChannels((current) =>
          clearSavedDirtyPaymentChannels(
            current,
            [channelCode],
          ));
      }
      setDataSource("loaded");

      toast.success(revisionUnchanged
        ? payload?.message ?? "支付设置已保存"
        : "服务端已保存请求版本，本地新修改仍待保存。",
      );
    } catch (error) {
      const text = getClientErrorMessage(
        error,
        "支付设置保存失败",
      );

      setMessage(text);
      toast.error(text);
    } finally {
      setSavingChannel(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-slate-500">
        正在读取支付设置...
      </div>
    );
  }

  const editable =
    dataSource
    === PAYMENT_SETTINGS_DATA_SOURCES.LOADED;
  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
        人工付款渠道只有在收款地址和付款说明完整后才能启用。
        USDT-BEP20 还必须填写 Token 合约地址。
        保存设置不会自动开启任何配置不完整的渠道。
      </div>

      {message ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {message}
        </div>
      ) : null}

      {!editable ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          当前显示的是只读模板，不是已从服务端完整读取的正式配置。保存功能已关闭，请修复读取问题并刷新页面。
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 disabled:opacity-70"
      >
        {channels.map((channel) => {
          const ready = isChannelReady(channel);
          const manual =
            channel.review_mode === "manual";
          const compatibilityReadOnly =
            channel.compatibility_read_only === true;

          return (
            <fieldset
              key={channel.channel}
              className="rounded-xl border p-4"
              disabled={
                !editable
                || savingChannel === channel.channel
                || compatibilityReadOnly
              }
            >
              {compatibilityReadOnly ? (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                  此渠道仍使用旧版兼容字段，公开渠道和充值创建已暂停；需要单独授权同步兼容字段。同步后仍保持未配置和未启用。
                </div>
              ) : null}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">
                    {channel.display_name
                      || channel.channel}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    渠道代码：{channel.code}
                    {"  "}
                    配置状态：
                    <span
                      className={
                        ready
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-amber-700"
                      }
                    >
                      {ready ? "已就绪" : "未就绪"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {channel.enabled
                      ? "已启用"
                      : "未启用"}
                  </span>

                  <Switch
                    checked={channel.enabled}
                    disabled={!ready && !channel.enabled}
                    onCheckedChange={(checked) =>
                      updateChannel(channel.channel, {
                        enabled: checked,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="显示名称">
                  <Input
                    value={channel.display_name}
                    onChange={(event) =>
                      updateChannel(channel.channel, {
                        display_name:
                          event.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="审核模式">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={channel.review_mode}
                    onChange={(event) =>
                      updateChannel(channel.channel, {
                        review_mode:
                          event.target.value === "manual"
                            ? "manual"
                            : "provider",
                      })
                    }
                  >
                    <option value="provider">
                      Provider 自动处理
                    </option>
                    <option value="manual">
                      人工付款、人工审核
                    </option>
                  </select>
                </Field>

                <Field label="最低金额">
                  <Input
                    inputMode="decimal"
                    value={numericDrafts[channel.channel]?.minimum_amount ?? ""}
                    onChange={(event) => {
                      updateNumericDraft(
                        channel.channel,
                        "min_amount",
                        event.target.value,
                      );
                      updateNumericDraft(
                        channel.channel,
                        "minimum_amount",
                        event.target.value,
                      );
                    }}
                  />
                </Field>

                <Field label="最高金额">
                  <Input
                    inputMode="decimal"
                    value={numericDrafts[channel.channel]?.maximum_amount ?? ""}
                    onChange={(event) =>
                      updateNumericDraft(
                        channel.channel,
                        "maximum_amount",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="手续费率">
                  <Input
                    inputMode="decimal"
                    value={numericDrafts[channel.channel]?.fee_rate ?? ""}
                    onChange={(event) =>
                      updateNumericDraft(
                        channel.channel,
                        "fee_rate",
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="支付币种">
                  <Input
                    value={channel.currency}
                    onChange={(event) =>
                      updateChannel(channel.channel, {
                        currency:
                          event.target.value,
                      })
                    }
                  />
                </Field>

                <Field label="网络">
                  <Input
                    value={channel.network ?? ""}
                    disabled={
                      channel.channel === "alipay"
                      || channel.channel === "wechat"
                    }
                    onChange={(event) =>
                      updateChannel(channel.channel, {
                        network:
                          event.target.value || null,
                      })
                    }
                  />
                </Field>

                <Field label="排序">
                  <Input
                    inputMode="numeric"
                    value={numericDrafts[channel.channel]?.sort_order ?? ""}
                    onChange={(event) =>
                      updateNumericDraft(
                        channel.channel,
                        "sort_order",
                        event.target.value,
                      )
                    }
                  />
                </Field>
              </div>

              {manual ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="mb-3 text-sm font-semibold text-emerald-900">
                    人工付款公开信息
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="付款地址 / 收款地址">
                      <Input
                        value={
                          channel.payment_address ?? ""
                        }
                        placeholder="填写用户实际转账的收款地址"
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              payment_address:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="代币合约 / Token 合约">
                      <Input
                        value={
                          channel.token_contract ?? ""
                        }
                        placeholder={
                          channel.channel
                            === "usdt_bep20"
                            ? "BEP20 必填"
                            : "不需要时可留空"
                        }
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              token_contract:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field
                      label="付款说明"
                      className="md:col-span-2"
                    >
                      <textarea
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={
                          channel.payment_instructions
                          ?? ""
                        }
                        placeholder="例如：仅使用指定网络转账，足额支付后提交交易哈希，到账后由管理员审核。"
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              payment_instructions:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">
                    Provider 配置
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Provider">
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={channel.provider}
                        onChange={(event) => {
                          const provider =
                            event.target.value as
                              PaymentProviderCode;

                          updateChannel(
                            channel.channel,
                            {
                              provider,
                              provider_name:
                                provider,
                            },
                          );
                        }}
                      >
                        <option
                          value={defaultProvider(
                            channel.channel,
                          )}
                        >
                          {providerLabel(
                            defaultProvider(
                              channel.channel,
                            ),
                          )}
                        </option>
                      </select>
                    </Field>

                    <Field label="API 地址">
                      <Input
                        value={channel.api_url ?? ""}
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              api_url:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="商户号">
                      <Input
                        value={
                          channel.merchant_id_masked
                          ?? ""
                        }
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              merchant_id_masked:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="App ID">
                      <Input
                        value={
                          channel.app_id_masked ?? ""
                        }
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              app_id_masked:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="回调地址">
                      <Input
                        value={
                          channel.callback_url ?? ""
                        }
                        onChange={(event) =>
                          updateChannel(
                            channel.channel,
                            {
                              callback_url:
                                event.target.value
                                || null,
                            },
                          )
                        }
                      />
                    </Field>

                    <Field label="超时时间">
                      <Input
                        inputMode="numeric"
                        value={numericDrafts[channel.channel]?.timeout_minutes ?? ""}
                        onChange={(event) =>
                          updateNumericDraft(
                            channel.channel,
                            "timeout_minutes",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  </div>

                  {!channel.configured ? (
                    <div className="mt-3 text-xs leading-5 text-amber-700">
                      Provider 服务端配置尚未就绪。
                      当前页面不会写入真实密钥，也不能将此渠道标记为已配置。
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-4 flex justify-end border-t pt-3">
                <Button
                  disabled={
                    !dirtyChannels.has(channel.channel)
                    || savingChannel !== null
                    || compatibilityReadOnly
                  }
                  onClick={() => saveChannel(channel.channel)}
                  type="button"
                >
                  {savingChannel === channel.channel
                    ? "保存中..."
                    : "保存此渠道"}
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label
      className={`block space-y-2 ${className}`}
    >
      <span className="text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
