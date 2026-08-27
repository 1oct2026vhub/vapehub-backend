# VapeHub Backend

Node.js / Express API for the VapeHub storefront and admin panel. It handles catalog, cart and checkout, orders, payments (Worldpay and Viva Wallet), shipping (ShipStation), CMS, SEO, loyalty, newsletters, and related background jobs.

| | |
| --- | --- |
| API base | `/api` |
| Default port | `5000` (`PORT` in `.env`; falls back to `3000` if unset) |
| Auth | `Authorization: Bearer <jwt>` |
| Interactive docs | [http://localhost:5000/api-docs](http://localhost:5000/api-docs) (disabled in production) |

This README is the map of the service. Request/response shapes live in Swagger. Env vars live in [`.env.example`](.env.example). Feature-specific flows that already have their own docs are linked at the bottom.

---

## Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Database | MySQL 8 via Sequelize (`db/migrations`, `db/seeders`) |
| Cache | Redis via ioredis (optional — if Redis is down, reads fall through to the DB) |
| Auth | JWT (Passport `user-local` strategy), Bearer token |
| Files | AWS S3 + CloudFront; Sharp for product image resize |
| Queues | AWS SQS (email campaigns, bulk order-status) |
| Email | Nodemailer / SMTP; `EMAIL_TEST_MODE=true` previews locally |
| Docs | swagger-jsdoc + swagger-ui-express |

---

## Prerequisites

- Node.js **20.x**
- MySQL **8.0**
- Redis (recommended)
- npm (`package-lock.json` is the lockfile)

The `Dockerfile` still runs `yarn install` and copies `yarn.lock`. For local work, use **npm**.

---

## Local setup

```bash
cp .env.example .env
# fill in DB_*, JWT_*, REDIS_URL, and any integrations you need

npm install
npm run migrate
npm run seed          # optional — includes CMS and live-data migration seeders
npm run dev           # nodemon, entry: bin/www
```

`npm start` is the same process without nodemon.

Copy `.env.example` rather than inventing variables. It covers app, JWT, MySQL, legacy DB (`OLD_DB_*` for some seeders), Redis, email, S3, Worldpay, Viva Wallet, ShipStation, Trustpilot, SEO/Prerender, Stripo, and optional SQS workers.

Typical local CORS:

```
FRONTEND_URL=http://localhost:3000
ADMIN_FRONTEND_URL=http://localhost:4000
CORS_ORIGINS=http://localhost:3000,http://localhost:4000,http://localhost:5000
```

With `EMAIL_TEST_MODE=true`, outbound mail is written under `emails/` and can be previewed via `/api/email` instead of SMTP.

Sequelize uses `NODE_ENV` (`local` / `development` / `test` / `production`) against `config/database.js`. Pool sizes differ per env.

---

## Docker

`docker-compose.yml` runs the API and MySQL 8. Redis is **not** included.

```bash
docker compose up --build
```

| Service | Host access |
| --- | --- |
| API | `http://localhost:5000` |
| MySQL | `localhost:3305` → container `3306` |

Compose sets `DB_HOST=vapehub_db`. Point `REDIS_URL` at a local or remote Redis, or omit it and accept cache miss → DB.

Image: Node **20.17.0**, port **5000**.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | `node bin/www` |
| `npm run dev` | nodemon |
| `npm run migrate` | Sequelize migrations |
| `npm run migrate:deploy` | Undo **all** migrations, then re-run them (**destructive**) |
| `npm run seed` | All seeders |
| `npm run worker:email-campaign` | SQS worker for promotional email chunks |
| `npm run worker:bulk-order-status-sqs` | SQS worker for async bulk order-status |
| `npm run reconcile:worldpay` | One-shot Worldpay unpaid-order reconcile |
| `npm run query:worldpay` | Query Worldpay payment state |
| `npm run recache:sitemap` | Recache sitemap URLs via Prerender |
| `npm run append:flavour-attribute-terms` | One-off flavour/collection helper |

There is no project test runner in `package.json`.

---

## Auth and roles

One JWT scheme for storefront and admin (`JWT_SECRET` / `JWT_REFRESH_SECRET`).

- Storefront protected routes use `authenticateJWT` (Passport JWT).
- Admin routes use `authMiddleware(true)`, which requires a role with `is_admin_panel = true`.
- Roles (`roles` table): `permission` is `full` | `limited` | `user`; `is_admin_panel` gates the admin API.
- Login/register/forgot-password are rate-limited (`express-rate-limit`) on `/api/auth`.
- Guest users can later call `POST /api/auth/convert-guest-account`.
- CKEditor: `GET /api/auth/ckeditor-token` (authenticated).

Send:

```
Authorization: Bearer <access_token>
```

Refresh: `POST /api/auth/refresh-token`.

---

## Checkout, orders, and payment

Happy path:

1. **Cart** — `/api/cart` (logged-in) or guest cart payload on checkout.
2. **Quote** — `POST /api/checkout` or `POST /api/checkout/guest`. Applies coupons, deals, shipping, loyalty. Free shipping threshold is `checkout.FREE_SHIPPING_MERCHANDISE_GBP` (£30) in `config/constants.js`.
3. **Place order** — `POST /api/order` (JWT) or `POST /api/order/guest`. Guest one-shot: `POST /api/checkout/guest/checkout-and-order`.
4. Order is created as **`pending`** with a unique `ORD-…` id. Stock is reserved (`stock_reservations`, default ~10 minutes) while payment is outstanding.
5. **Pay**
   - **Worldpay** — hosted checkout; webhook `POST /api/payment/worldpay/webhook` (raw body `application/vnd.worldpay.events-v1.hal+json`). Also `POST /api/payment/worldpay/payment-success` and `…/payment-cancel`. Set `WORLDPAY_WEBHOOK_SECRET` when Event-Signature is on. Unpaid pending Worldpay orders can be reused within `WORLDPAY_PENDING_ORDER_TTL_HOURS` (default 24) if the cart totals still match.
   - **Viva Wallet** — order code at place-order / `POST /api/order/viva-wallet-order-code`; webhook `POST /api/payment/viva/webhook`; also `/api/order/viva/:orderCode`.
   - **Loyalty-only** — if points cover the total, no card PSP is required (`finalizePointsOnlyOrder`).
6. Successful payment moves the order to **`processing`** and finalizes stock. Failed/cancelled paths go to **`fail`** / **`cancel`**.
7. Fulfilment is driven by admin status updates and **ShipStation** webhooks (see order statuses below).

Coupons: `POST /api/checkout/apply-coupon` and `POST /api/checkout/guest/apply-coupon`.

Abandoned-cart emails only consider pending orders created on/after `ABANDONED_CART_START_AT`.

---

## Order statuses

Canonical list: `config/constants.js` → `orderStatus` / `orderStatusEnums`.

Normal fulfilment:

`draft` → `pending` → `processing` → `packed` → `shipped` → `out_for_delivery` → `delivered` → `completed`

Exceptions: `fail`, `cancel`, then returns `return_requested` → `return_approved` → `return_received` → `refunded`.

Non-admin updates must follow those transitions (`Order` `beforeUpdate`). Admin (`options.isAdmin`) may set any valid enum.

ShipStation webhook mapping (detail: [`components/admin/shipStationWebhook/README.md`](components/admin/shipStationWebhook/README.md)):

| ShipStation event | Order status |
| --- | --- |
| `ORDER_NOTIFY` | `processing` |
| `ITEM_ORDER_NOTIFY` | `packed` |
| `SHIP_NOTIFY` | `shipped` |
| `ITEM_SHIP_NOTIFY` | `out_for_delivery` |
| `FULFILLMENT_SHIPPED` | `delivered` |
| `FULFILLMENT_REJECTED` | `fail` |

Customer cancel is allowed while status is `pending` or `processing`. Returns are allowed from `delivered` or `completed`.

Admin bulk status: `PUT /api/admin/orders/bulk-status` (sync) or `POST /api/admin/orders/bulk-status/async` (SQS). Recovery: [`cron/README.md`](cron/README.md).

---

## API overview

Interactive docs: `/api-docs` (non-production).

### Storefront (`/api`)

Mounted from `components/router.js`:

| Prefix | Area |
| --- | --- |
| `/api/auth` | Login, register, verify email, forgot/reset password, refresh, convert guest, CKEditor token |
| `/api/users` | Profile, addresses, password, delete account, referrals, contact info |
| `/api/brands`, `/api/category`, `/api/product`, `/api/deals` | Catalog, buying guides, related content, deals, filter-variants |
| `/api/cart`, `/api/checkout`, `/api/order` | Cart, coupons, guest/logged-in checkout and orders |
| `/api/payment` | Worldpay (`/worldpay`) and Viva (`/viva`) |
| `/api/shipping-method` | Shipping methods |
| `/api/loyalty-points` | Balance / redemption |
| `/api/review`, `/api/notifications` | Reviews and notifications |
| `/api/home`, `/api/menu`, `/api/footer` | Homepage, navigation, footer |
| `/api/blogs`, `/api/faqs`, `/api/testimonials` | Content |
| `/api/mailSubscription` | Subscribe / unsubscribe |
| `/api/seo`, `/api/settings` | SEO meta, sitemap, public settings |
| `/api/popularCategory`, `/api/shopByCategory`, `/api/entity-banners` | Merchandising |
| `/api/email` | Local email preview index (`EMAIL_TEST_MODE`) |

### Admin (`/api/admin`)

Requires admin JWT (`is_admin_panel`). Mounted from `components/admin/admin.route.js`:

| Prefix | Area |
| --- | --- |
| `/api/admin/auth` | Admin login / password flows |
| `/api/admin/user`, `/api/admin/customer` | Staff and customers |
| `/api/admin/category`, `/api/admin/brand`, `/api/admin/products` | Catalog, buying guides, related links |
| `/api/admin/attributes`, `/api/admin/attribute-terms` | Product attributes |
| `/api/admin/product-variants`, `/api/admin/stock-management`, `/api/admin/inventory` | Variants, stock, reservations, movements |
| `/api/admin/shipping-methods` | Shipping methods CRUD |
| `/api/admin/orders`, `/api/admin/transactions` | Orders, bulk status jobs, reports, payments |
| `/api/admin/coupons`, `/api/admin/deals`, `/api/admin/loyalty-points` | Promotions |
| `/api/admin/banners`, `/api/admin/carousels`, `/api/admin/blog`, `/api/admin/faqs` | CMS |
| `/api/admin/menus`, `/api/admin/footer`, `/api/admin/seo` | Navigation, footer, SEO/redirects |
| `/api/admin/review` | Moderate reviews |
| `/api/admin/shipStation`, `/api/admin/shipStationWebhook` | Fulfilment |
| `/api/admin/newsletter-templates`, `/api/admin/mail-subscription-settings` | Stripo templates, campaigns, subscribers |
| `/api/admin/mailSubscription` | `POST` create subscriber (admin) |
| `/api/admin/dashboard`, `/api/admin/settings`, `/api/admin/contactus` | Ops |
| `/api/admin/welcome-content`, `/api/admin/feature-content` | Homepage CMS |
| `/api/admin/flash-news`, `/api/admin/referral-method` | Flash news, referral methods |
| `/api/admin/popularCategory`, `/api/admin/shopByCategory` | Merchandising |

### Internal (workers)

Shared-secret headers, not user JWTs:

| Method | Path | Secret |
| --- | --- | --- |
| `POST` | `/api/internal/email-campaigns/process-chunk` | `EMAIL_CHUNK_INTERNAL_KEY` |
| `POST` | `/api/internal/bulk-order-status/process-item` | `BULK_ORDER_STATUS_INTERNAL_KEY` |

Static: `/public`, `/logs`. Body size: `BODY_LIMIT` (default in example: `50mb`).

---

## Payments and fulfilment

**Worldpay** — webhook + success/cancel as above. Reconcile: `npm run reconcile:worldpay`. Webhook retry / unpaid reconcile crons exist but are **commented out** in `cron/init.js`. Failed webhooks can sit in `payment_webhook_inbox`.

**Viva Wallet** — demo/live hosts via `VIVA_API_BASE_*`.

**ShipStation** — admin under `/api/admin/shipStation`. Incoming: `POST /api/admin/shipStationWebhook/webhook` (no user JWT; always 200). Map orders by `order_unique_id` as ShipStation `orderNumber`.

---

## Email

Templates are keyed in `config/constants.js` → `emailTypes`, including register, forgot password, welcome, order confirmation / packed / shipped / out-for-delivery / delivered / failed / cancellation, refund, account deletion, referral, low stock, product updates, promotional newsletters.

Campaigns: admin newsletter templates (Stripo) → SQS chunks → `workers/emailCampaignWorker.js`.

---

## Workers

Run as **separate processes** (not started by `npm run dev`).

```bash
npm run worker:email-campaign
# EMAIL_CAMPAIGN_SQS_QUEUE_URL, EMAIL_CHUNK_INTERNAL_KEY, API_BASE_URL

npm run worker:bulk-order-status-sqs
# BULK_ORDER_STATUS_DELIVERY_MODE=async_sqs, BULK_ORDER_STATUS_SQS_QUEUE_URL,
# BULK_ORDER_STATUS_INTERNAL_KEY, API_BASE_URL
```

---

## Cron jobs

Loaded from `cron/init.js` in the API process. Timezone: `UK_TIMEZONE` (default `Europe/London`) where the job sets it.

**Enabled**

| Job | Schedule | Notes |
| --- | --- | --- |
| Low-stock alert | hourly (`0 * * * *`) | Variants at/below threshold |
| Product-update newsletters | 09:00 daily / 10:00 Mon / 11:00 1st (UK) | Mail-subscription settings |
| Export-file cleanup | 03:00 UK daily | Old S3 user exports |
| Email-campaign chunk recovery | `EMAIL_CHUNK_RECOVERY_CRON` (default `*/5 * * * *`) | No-op without `EMAIL_CAMPAIGN_SQS_QUEUE_URL` |
| Bulk order-status recovery | `BULK_ORDER_STATUS_RECOVERY_CRON` (default `*/5 * * * *`) | No-op unless async SQS mode |

**Present, commented out in `cron/init.js`**

Worldpay webhook retry, Worldpay unpaid reconcile, Trustpilot invitations, coupon expiration, temporary-user cleanup.

---

## How the code is organised

Feature modules under `components/<name>/` typically have:

- `routes/` — Express + Swagger comments
- `domain/` — controllers
- `helper/` — validators and domain helpers

Admin mirrors this under `components/admin/<name>/`. Shared infra is `library/` (cache, S3, email, middleware, promotional SQS) and `utils/`.

`bin/www` listens, then on `SIGTERM`/`SIGINT` closes HTTP, email transport, Redis, and MySQL (`SHUTDOWN_TIMEOUT_MS`, default 30s).

Access logs: `logs/access.log` (morgan). App logs: Pino.

---

## Project layout

```
backend/
  app.js                 Express app, CORS, Helmet, Swagger, /api
  bin/www                HTTP server, graceful shutdown
  components/            Storefront + admin + internal routes
  config/                env, DB, Passport, Swagger, AWS, constants
  cron/                  Scheduled jobs
  db/migrations          Sequelize migrations
  db/seeders             Seed / legacy-import data
  emails/                Local preview output (gitignored in practice)
  library/               Email, cache, logging, middleware, S3, SQS helpers
  models/                Sequelize models (~85)
  workers/               SQS consumers
  scripts/               Operational one-offs
  utils/                 Shared helpers
```

---

## Further documentation

| Doc | Topic |
| --- | --- |
| [`.env.example`](.env.example) | All environment variables |
| [`cron/README.md`](cron/README.md) | Bulk order-status recovery and admin job APIs |
| [`components/admin/shipStationWebhook/README.md`](components/admin/shipStationWebhook/README.md) | ShipStation webhook events and setup |
| [`FILTER_VARIANTS_BY_ATTRIBUTES_API_DOCUMENTATION.md`](FILTER_VARIANTS_BY_ATTRIBUTES_API_DOCUMENTATION.md) | `POST /api/product/filter-variants` |
| [`DEAL_FILTERING_DOCUMENTATION.md`](DEAL_FILTERING_DOCUMENTATION.md) | Deal-aware product listing |
| `/api-docs` | Full OpenAPI surface (non-production) |
