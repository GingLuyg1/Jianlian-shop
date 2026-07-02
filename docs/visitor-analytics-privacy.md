# Visitor Analytics Privacy

## Purpose

Jianlian Shop records only privacy-safe frontend page view events for operating metrics in the admin dashboard:

- PV: one counted page view when a user opens or refreshes a tracked storefront page.
- UV: one counted anonymous visitor per business day.

The business timezone used by the dashboard is `Asia/Shanghai`.

## Collected Fields

The page view endpoint stores:

- hashed anonymous visitor id
- optional authenticated user id
- sanitized page path with sensitive query parameters removed
- referrer host only
- hashed session id
- hashed IP summary
- hashed User-Agent summary
- event timestamp in UTC
- safe metadata such as page type and environment

## Fields Not Collected

The analytics endpoint must not store:

- full IP address
- raw visitor id
- full User-Agent
- full external referrer URL with query parameters
- passwords, tokens, access codes, payment parameters, signatures, or order query credentials
- form content, payment callback bodies, digital inventory content, or administrator operation details
- device fingerprints or precise location

## Filtering

The frontend tracker excludes `/admin`, `/api`, `/_next`, static assets, favicon, health checks, robots, and sitemap routes.

The server also filters excluded paths, obvious bots, oversized requests, and very short duplicate reports for the same visitor and page.

## Retention

Recommended retention:

- Keep detailed `page_visit_events` for 90 days.
- Keep daily aggregate `visitor_daily_stats` for long-term trend reporting.
- Before deleting historical events, confirm dashboard trend requirements and export aggregate summaries.

No production data is deleted automatically by the application or migration.
