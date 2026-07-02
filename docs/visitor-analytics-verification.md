# Visitor Analytics Verification

## Current Implementation

- Frontend tracker: `components/analytics/PageViewTracker.tsx`
- Ingest API: `app/api/analytics/page-view/route.ts`
- Admin dashboard: `app/admin/page.tsx`
- Required base migration: `supabase/migrations/20260624_admin_visit_analytics.sql`
- Optional aggregate migration: `supabase/migrations/20260702_visitor_daily_stats.sql`

## Definitions

- PV: every valid tracked storefront page open, refresh, or client-side route change.
- UV: distinct `visitor_key` per business date.
- Business timezone: `Asia/Shanghai`.
- Stored timestamps: UTC `timestamptz`.

## Tracked Pages

The tracker can record public page views such as:

- homepage
- product category and product list pages
- product detail pages
- login and register pages
- public legal pages
- order query entry page

## Exclusions

The tracker and API exclude:

- `/admin`
- `/api`
- `/_next`
- static assets
- favicon
- health checks
- robots and sitemap routes
- obvious bot or automation User-Agent values

## Dashboard Behavior

- If the visit table exists and has no records, today UV and PV display `0`.
- If the visit table is missing, the cards display `待初始化`.
- If the query fails for another reason, the cards display `读取失败`.
- Today and yesterday are grouped using `Asia/Shanghai`.
- Trend charts aggregate visits by business date.

## Privacy Controls

- The browser stores an anonymous `visitor_id` only for analytics.
- The server stores only a hash of the anonymous visitor id.
- The server stores only a hash of the IP and User-Agent summary.
- The server stores only referrer host, not full external URLs.
- Sensitive query parameters are removed before storage.

## Manual Test Checklist

| Scenario | Expected result | Status |
| --- | --- | --- |
| First homepage visit | PV +1, UV +1 | Not manually executed |
| Refresh homepage after duplicate window | PV +1, UV unchanged | Not manually executed |
| Same visitor opens multiple products | PV increases, UV unchanged for same day | Not manually executed |
| Two browsers visit site | PV +2, UV +2 | Not manually executed |
| Login after anonymous visit | Same anonymous visitor hash remains, user_id may be attached | Not manually executed |
| Visit `/admin` | Not counted | Not manually executed |
| Visit `/api` | Not counted | Not manually executed |
| Bot User-Agent | Skipped | Not manually executed |
| No visit data | Dashboard shows 0 | Code path implemented |
| Missing migration | Dashboard shows `待初始化` | Code path implemented |
| Query failure | Dashboard shows `读取失败` | Code path implemented |
| 7-day trend | Aggregates PV and UV by business date | Code path implemented |
| 30-day trend | Aggregates PV and UV by business date | Code path implemented |

## Required Manual SQL

Run the base migration before expecting dashboard counts:

```sql
-- supabase/migrations/20260624_admin_visit_analytics.sql
```

Optional aggregate support:

```sql
-- supabase/migrations/20260702_visitor_daily_stats.sql
```

## Remaining Notes

The dashboard currently reads directly from `page_visit_events`. The optional aggregate table is provided for future scheduled aggregation when traffic volume grows.
