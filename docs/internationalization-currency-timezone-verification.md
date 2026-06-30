# Internationalization, Currency, and Timezone Verification

## Current Language Handling Issues

- The application is currently Chinese-first.
- Status labels exist in multiple modules, including order, payment, refund, inventory, and delivery.
- A shared status label map was added in `lib/i18n/status.ts` for future consolidation.

## Current Currency Handling Issues

- Existing UI used mixed formatting styles such as `¥${amount.toFixed(2)}`, `currency amount`, and `USDT` suffixes.
- Some records have explicit `currency`; old records without currency are treated as `CNY` for compatibility.
- No exchange-rate service exists. Reports must not auto-convert or mix currencies as a single normalized amount.

## Current Timezone Handling Issues

- Several pages used `new Date()` and browser/server local `toLocaleString("zh-CN")`.
- Business reporting should use `Asia/Shanghai` boundaries.
- Database timestamps remain stored as UTC or the current database standard.

## Unified Configuration Structure

Public settings are backed by `site_settings`:

- `default_locale`
- `supported_locales`
- `default_currency`
- `currency_symbol`
- `business_timezone`
- `date_format`
- `time_format`

Compatibility migration:

- `supabase/migrations/20260629_i18n_currency_timezone_settings.sql`

This migration is not executed automatically.

## Money Formatting Result

Shared utilities:

- `formatCurrency`
- `formatMoney`
- `formatAmountWithCurrency`
- `parseAmount`
- `normalizeAmount`
- `toMinorUnits`
- `fromMinorUnits`

Rules:

- `CNY`, `USD`, `EUR`, `HKD`: 2 decimals.
- `JPY`: 0 decimals.
- `USDT`: up to 6 decimals and no fiat symbol.
- Empty or invalid amounts display `—`.
- Negative values are preserved for refunds and debits.

## Date Time Formatting Result

Shared utilities:

- `formatDate`
- `formatDateTime`
- `formatRelativeTime`
- `getBusinessDateKey`
- `getBusinessDayRange`
- `getBusinessRangeForDays`
- `normalizeDateRange`

Default timezone:

- `Asia/Shanghai`

## Report Boundary Result

- Report default range now uses business day boundaries instead of local machine midnight.
- Trend date keys use business timezone date keys.
- CSV export timestamps use shared datetime formatting and label the business timezone in headers.

## CSV Export Result

- CSV keeps UTF-8 BOM.
- Formula injection guard is retained.
- Orders, payments, recharges, refunds, users, and balance exports now include currency columns where applicable.
- Exported amount fields include formatted amount and explicit currency columns.

## Historical Compatibility

- Missing currency is treated as `CNY`.
- Original database values are not rewritten.
- No automatic currency conversion is performed.

## Fixed Issues

- Added shared i18n config defaults.
- Added shared money/time/status formatting utilities.
- Added compatibility migration for public locale/currency/timezone settings.
- Improved report date boundaries and CSV amount/currency/time output.
- Updated payment, refund, and reconciliation display utilities in core paths.

## Remaining Issues

- Some older UI modules still have local `formatDate` or hardcoded `¥` and should be migrated incrementally.
- Admin settings UI type definitions support the new fields, but the visible settings form still needs a clean UI pass due legacy encoded labels in the file.
- Payment records table supports shared formatter, but not every compressed JSX call site was safely changed to pass row currency in this session.

## Required Manual Migration

Run manually in Supabase SQL Editor after review:

```sql
-- supabase/migrations/20260629_i18n_currency_timezone_settings.sql
```

