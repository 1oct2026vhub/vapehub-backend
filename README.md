# VapeHub Backend

Node.js / Express API for the VapeHub storefront and admin panel. It handles catalog, cart and checkout, orders, payments (Worldpay and Viva Wallet), shipping (ShipStation), CMS, SEO, loyalty, newsletters, and related background jobs.

API base path: `/api`  
Default local port: `5000` (`PORT` in `.env`; falls back to `3000` if unset)

---

## Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | MySQL 8 via Sequelize |
| Cache | Redis (optional — if Redis is down, requests fall through to the DB) |
| Auth | JWT (Passport), Bearer token |
| Files | AWS S3 (+ CloudFront) |
| Queues | AWS SQS (email campaigns, bulk order-status) |
| Docs | Swagger UI at `/api-docs` (disabled in production) |

---

## Prerequisites

- Node.js **20.x**
- MySQL **8.0**
- Redis (recommended; caching degrades gracefully without it)
- npm (`package-lock.json` is the lockfile)

---

## Local setup

```bash
cp .env.example .env
# fill in DB_*, JWT_*, REDIS_URL, and any integrations you need

npm install
npm run migrate
npm run seed          # optional — seeders include live-data / CMS data
npm run dev           # nodemon, entry: bin/www
```

`npm start` runs the same process without nodemon.

Copy `.env.example` rather than inventing variables. It is the source of truth for app, JWT, MySQL, Redis, email, S3, Worldpay, Viva Wallet, ShipStation, Trustpilot, SEO/Prerender, Stripo, and optional SQS workers.

CORS is driven by `CORS_ORIGINS` (comma-separated). Typical local values:

```
FRONTEND_URL=http://localhost:3000
ADMIN_FRONTEND_URL=http://localhost:4000
CORS_ORIGINS=http://localhost:3000,http://localhost:4000,http://localhost:5000
```

With `EMAIL_TEST_MODE=true`, emails are previewed locally instead of going through SMTP.

---

## Docker

`docker-compose.yml` runs the API and MySQL 8.

```bash
docker compose up --build
```

| Service | Host access |
| --- | --- |
| API | `http://localhost:5000` |
| MySQL | `localhost:3305` → container `3306` |

The compose file sets `DB_HOST=vapehub_db`. Redis is not included; run Redis locally or point `REDIS_URL` at an existing instance.

The `Dockerfile` targets Node 20.17.0 and exposes port 5000.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Production-style process (`node bin/www`) |
| `npm run dev` | Dev server with nodemon |
| `npm run migrate` | Run Sequelize migrations (`db/migrations`) |
| `npm run migrate:deploy` | Undo all migrations, then re-run them (**destructive**) |
| `npm run seed` | Run all seeders (`db/seeders`) |
| `npm run worker:email-campaign` | SQS worker for promotional email chunks |
| `npm run worker:bulk-order-status-sqs` | SQS worker for async bulk order-status updates |
| `npm run reconcile:worldpay` | One-shot Worldpay unpaid-order reconcile |
| `npm run query:worldpay` | Query Worldpay payment state for an order |
| `npm run recache:sitemap` | Recache sitemap URLs via Prerender |
| `npm run append:flavour-attribute-terms` | One-off flavour/collection category helper |

---

## API overview

Interactive docs: [http://localhost:5000/api-docs](http://localhost:5000/api-docs) (non-production only).

Authenticated routes expect:

```
Authorization: Bearer <jwt>
```

### Storefront (`/api`)

Mounted from `components/router.js`:

| Prefix | Area |
| --- | --- |
| `/api/auth` | Login, register, email verify, forgot/reset password, refresh token, convert guest |
| `/api/users` | Profile, addresses, password, delete account, referrals, contact info |
| `/api/brands`, `/api/category`, `/api/product`, `/api/deals` | Catalog, buying guides, related content, deals, filter-variants |
| `/api/cart`, `/api/checkout`, `/api/order` | Cart, coupons, guest/logged-in checkout and orders |
| `/api/payment` | Worldpay (`/worldpay`) and Viva Wallet (`/viva`) |
| `/api/shipping-method` | Shipping methods |
| `/api/loyalty-points` | Loyalty balance / redemption |
| `/api/review`, `/api/notifications` | Reviews and notifications |
| `/api/home`, `/api/menu`, `/api/footer` | Homepage, navigation, footer |
| `/api/blogs`, `/api/faqs`, `/api/testimonials` | Content |
| `/api/mailSubscription` | Newsletter subscribe / unsubscribe |
| `/api/seo`, `/api/settings` | SEO meta, sitemap, public settings |
| `/api/popularCategory`, `/api/shopByCategory`, `/api/entity-banners` | Merchandising |

Guest checkout and guest coupon apply live on `/api/checkout/guest*`. Orders can be placed as a logged-in user or as a guest (`POST /api/order/guest`).

### Admin (`/api/admin`)

JWT admin middleware. Mounted from `components/admin/admin.route.js`:

| Prefix | Area |
| --- | --- |
| `/api/admin/auth` | Admin login / password flows |
| `/api/admin/user`, `/api/admin/customer` | Staff and customers |
| `/api/admin/category`, `/api/admin/brand`, `/api/admin/products` | Catalog CRUD, buying guides, related links |
| `/api/admin/attributes`, `/api/admin/attribute-terms` | Product attributes |
| `/api/admin/product-variants`, `/api/admin/stock-management`, `/api/admin/inventory` | Variants, stock, inventory |
| `/api/admin/orders`, `/api/admin/transactions` | Orders, bulk status jobs, reports, transactions |
| `/api/admin/coupons`, `/api/admin/deals`, `/api/admin/loyalty-points` | Promotions |
| `/api/admin/banners`, `/api/admin/carousels`, `/api/admin/blog`, `/api/admin/faqs` | CMS |
| `/api/admin/menus`, `/api/admin/footer`, `/api/admin/seo` | Navigation, footer, SEO/redirects |
| `/api/admin/shipStation`, `/api/admin/shipStationWebhook` | Fulfilment |
| `/api/admin/newsletter-templates`, `/api/admin/mail-subscription-settings` | Email campaigns (Stripo) and subscribers |
| `/api/admin/dashboard`, `/api/admin/settings`, `/api/admin/contactus` | Ops |
| `/api/admin/welcome-content`, `/api/admin/feature-content` | Homepage CMS |
| `/api/admin/flash-news`, `/api/admin/referral-method` | Flash news, referral methods |
| `/api/admin/popularCategory`, `/api/admin/shopByCategory` | Merchandising |

### Internal (worker callbacks)

Protected by shared secrets, not user JWTs:

| Method | Path | Secret |
| --- | --- | --- |
| `POST` | `/api/internal/email-campaigns/process-chunk` | `EMAIL_CHUNK_INTERNAL_KEY` |
| `POST` | `/api/internal/bulk-order-status/process-item` | `BULK_ORDER_STATUS_INTERNAL_KEY` |

---

## Payments and fulfilment

**Worldpay** — hosted payment + webhook at `POST /api/payment/worldpay/webhook`. Webhooks use a raw body parser (`application/vnd.worldpay.events-v1.hal+json`). Set `WORLDPAY_WEBHOOK_SECRET` when Event-Signature is enabled. Reconcile unpaid orders with `npm run reconcile:worldpay` or the (currently disabled) cron.

**Viva Wallet** — order-code generation and payment details under `/api/payment/viva` and `/api/order/viva*`.

**ShipStation** — admin API under `/api/admin/shipStation`. Incoming webhooks: `POST /api/admin/shipStationWebhook/webhook`. Event → order-status mapping is documented in [`components/admin/shipStationWebhook/README.md`](components/admin/shipStationWebhook/README.md).

---

## Workers

Run as **separate processes** (not started by `npm run dev`).

### Email campaign worker

```bash
npm run worker:email-campaign
```

Requires `EMAIL_CAMPAIGN_SQS_QUEUE_URL`, `EMAIL_CHUNK_INTERNAL_KEY`, and `API_BASE_URL`. Long-polls SQS and POSTs each chunk to `/api/internal/email-campaigns/process-chunk`.

### Bulk order-status SQS worker

```bash
npm run worker:bulk-order-status-sqs
```

Requires `BULK_ORDER_STATUS_DELIVERY_MODE=async_sqs`, `BULK_ORDER_STATUS_SQS_QUEUE_URL`, `BULK_ORDER_STATUS_INTERNAL_KEY`, and `API_BASE_URL`. Admin enqueue: `POST /api/admin/orders/bulk-status/async`. Details: [`cron/README.md`](cron/README.md).

---

## Cron jobs

Initialized from `cron/init.js` when the API process starts.

**Enabled today**

| Job | Schedule | Notes |
| --- | --- | --- |
| Low-stock alert | hourly (`0 * * * *`) | Emails variants at/below threshold |
| Product-update newsletters | 09:00 daily / 10:00 Mon / 11:00 1st of month (UK) | Honours mail-subscription settings |
| Export-file cleanup | 03:00 UK daily | Deletes old S3 user-export files |
| Email-campaign chunk recovery | `EMAIL_CHUNK_RECOVERY_CRON` (default `*/5 * * * *`) | No-op unless `EMAIL_CAMPAIGN_SQS_QUEUE_URL` is set |
| Bulk order-status recovery | `BULK_ORDER_STATUS_RECOVERY_CRON` (default `*/5 * * * *`) | No-op unless async SQS mode is configured |

**Present but commented out in `cron/init.js`**

Worldpay webhook retry, Worldpay unpaid-order reconcile, Trustpilot invitations, coupon expiration, temporary-user cleanup.

---

## Project layout

```
backend/
  app.js                 Express app, CORS, Swagger, /api mount
  bin/www                HTTP server, graceful shutdown
  components/            Storefront + admin + internal routes
  config/                env, DB, Passport, Swagger, AWS
  cron/                  Scheduled jobs
  db/migrations          Sequelize migrations
  db/seeders             Seed / migration-from-legacy data
  library/               Email, cache, logging, middleware
  models/                Sequelize models
  workers/               SQS consumers
  scripts/               One-off operational scripts
  utils/                 Shared helpers
```

---

## Further documentation

| Doc | Topic |
| --- | --- |
| [`.env.example`](.env.example) | All environment variables |
| [`cron/README.md`](cron/README.md) | Bulk order-status recovery and related admin endpoints |
| [`components/admin/shipStationWebhook/README.md`](components/admin/shipStationWebhook/README.md) | ShipStation webhook events and setup |
| [`FILTER_VARIANTS_BY_ATTRIBUTES_API_DOCUMENTATION.md`](FILTER_VARIANTS_BY_ATTRIBUTES_API_DOCUMENTATION.md) | `POST /api/product/filter-variants` |
| [`DEAL_FILTERING_DOCUMENTATION.md`](DEAL_FILTERING_DOCUMENTATION.md) | Deal-aware product listing filters |
| `/api-docs` | Full OpenAPI surface (non-production) |
