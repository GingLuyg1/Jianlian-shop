import {
  isPaymentChannelReady,
} from "./manual-channel-readiness.mjs";

export const PAYMENT_SETTINGS_DATA_SOURCES = Object.freeze({
  LOADING: "loading",
  LOADED: "loaded",
  FALLBACK: "fallback",
  READ_ERROR: "read_error",
  NEEDS_MIGRATION: "needs_migration",
});

export const PAYMENT_CHANNEL_NUMERIC_FIELDS = Object.freeze([
  "min_amount",
  "minimum_amount",
  "maximum_amount",
  "fee_rate",
  "sort_order",
  "timeout_minutes",
]);

export function createPaymentChannelNumericDraft(channel) {
  return Object.fromEntries(
    PAYMENT_CHANNEL_NUMERIC_FIELDS.map((field) => [
      field,
      String(channel[field] ?? ""),
    ]),
  );
}

export function createPaymentChannelNumericDrafts(channels) {
  return Object.fromEntries(
    channels.map((channel) => [
      channel.channel,
      createPaymentChannelNumericDraft(channel),
    ]),
  );
}

export function updatePaymentChannelNumericDraft(
  drafts,
  channelCode,
  field,
  rawValue,
) {
  if (!PAYMENT_CHANNEL_NUMERIC_FIELDS.includes(field)) {
    return drafts;
  }
  return {
    ...drafts,
    [channelCode]: {
      ...(drafts[channelCode] ?? {}),
      [field]: rawValue,
    },
  };
}

export function buildPaymentChannelNumericPatch(
  drafts,
  channel,
) {
  const draft = drafts[channel.channel]
    ?? createPaymentChannelNumericDraft(channel);
  return Object.fromEntries(
    PAYMENT_CHANNEL_NUMERIC_FIELDS.map((field) => [
      field,
      draft[field],
    ]),
  );
}

export function mergeSavedPaymentChannelNumericDrafts({
  drafts,
  savedChannel,
  requestedRevision,
  currentRevision,
}) {
  if (!savedChannel || requestedRevision !== currentRevision) {
    return drafts;
  }
  return {
    ...drafts,
    [savedChannel.channel]:
      createPaymentChannelNumericDraft(savedChannel),
  };
}

export function applyPaymentChannelEdit(channel, patch = {}) {
  const next = {
    ...channel,
    ...patch,
  };
  const modeChanged =
    patch.review_mode !== undefined
    && patch.review_mode !== channel.review_mode;
  const providerChanged =
    patch.provider !== undefined
    && patch.provider !== channel.provider;

  if (modeChanged || providerChanged) {
    next.configured = false;
    next.enabled = false;
  }

  if (
    !isPaymentChannelReady({
      channel: next.channel,
      provider: next.provider,
      reviewMode: next.review_mode,
      configured: next.configured,
      paymentAddress: next.payment_address,
      tokenContract: next.token_contract,
      paymentInstructions: next.payment_instructions,
    })
  ) {
    next.enabled = false;
  }

  return next;
}

export function selectDirtyPaymentChannels(
  channels,
  dirtyChannelIds,
) {
  const dirty = new Set(dirtyChannelIds);
  return channels.filter((channel) =>
    dirty.has(channel.channel));
}

export function canSavePaymentSettings({
  dataSource,
  dirtyCount,
  saving,
}) {
  return (
    dataSource === PAYMENT_SETTINGS_DATA_SOURCES.LOADED
    && dirtyCount > 0
    && saving !== true
  );
}

export function selectPaymentChannelForSave({
  channels,
  dirtyChannelIds,
  channelCode,
  dataSource,
  saving,
}) {
  if (
    !canSavePaymentSettings({
      dataSource,
      dirtyCount: dirtyChannelIds.has(channelCode) ? 1 : 0,
      saving,
    })
  ) {
    return null;
  }
  return channels.find(
    (channel) => channel.channel === channelCode,
  ) ?? null;
}

export function clearSavedDirtyPaymentChannels(
  dirtyChannelIds,
  savedChannelIds,
) {
  const remaining = new Set(dirtyChannelIds);
  for (const channelId of savedChannelIds) {
    remaining.delete(channelId);
  }
  return remaining;
}

export function mergeSavedPaymentChannel({
  channels,
  savedChannel,
  requestedRevision,
  currentRevision,
}) {
  if (
    !savedChannel
  ) {
    return { channels, accepted: false };
  }
  if (requestedRevision !== currentRevision) {
    return {
      channels: channels.map((channel) =>
        channel.channel === savedChannel.channel
          ? {
              ...channel,
              updated_at: savedChannel.updated_at,
            }
          : channel),
      accepted: false,
    };
  }
  return {
    channels: channels.map((channel) =>
      channel.channel === savedChannel.channel
        ? savedChannel
        : channel),
    accepted: true,
  };
}
