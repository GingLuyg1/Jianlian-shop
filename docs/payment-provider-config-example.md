# Payment Provider Config Example

Do not copy real secrets into this document. Use server environment variables or the hosting platform secret manager.

## Generic API Provider

Required names:

```text
GENERIC_PAYMENT_API_BASE_URL=<provider API URL>
GENERIC_PAYMENT_MERCHANT_ID=<merchant ID>
GENERIC_PAYMENT_API_SECRET=<server secret>
GENERIC_PAYMENT_WEBHOOK_SECRET=<callback verification secret>
```

Optional names:

```text
GENERIC_PAYMENT_APP_ID=<app ID>
GENERIC_PAYMENT_PUBLIC_KEY=<provider public key>
GENERIC_PAYMENT_PRIVATE_KEY=<merchant private key path or secret reference>
```

## Binance Pay Provider

Required names:

```text
BINANCE_PAY_API_BASE_URL=<Binance Pay API URL>
BINANCE_PAY_MERCHANT_ID=<merchant ID>
BINANCE_PAY_API_KEY=<server API key>
BINANCE_PAY_API_SECRET=<server API secret>
BINANCE_PAY_WEBHOOK_SECRET=<callback verification secret>
```

## Crypto Address Provider

Required names:

```text
CRYPTO_PAYMENT_WALLET_ADDRESS=<server configured receiving address>
CRYPTO_PAYMENT_WEBHOOK_SECRET=<callback verification secret>
```

Network-specific addresses should be split if the Provider gives different addresses:

```text
CRYPTO_PAYMENT_TRC20_WALLET_ADDRESS=<TRON address>
CRYPTO_PAYMENT_BEP20_WALLET_ADDRESS=<BSC address>
```

## Verification flags

Only set these after real sandbox verification:

```text
PAYMENT_PROVIDER_GENERIC_API_VERIFIED=true
PAYMENT_PROVIDER_BINANCE_VERIFIED=true
PAYMENT_PROVIDER_CRYPTO_ADDRESS_VERIFIED=true
```

## Safety rules

- Do not commit real values.
- Do not expose secrets through `NEXT_PUBLIC_*`.
- Do not log full request headers, signatures, private keys, wallet private keys, or callback payloads.
- Missing or partial config must display as unconfigured or partially configured.
- Complete config without sandbox verification must display as pending verification, not connected.
