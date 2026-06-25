# Cron Jobs

This folder contains background cron jobs initialized by `backend/cron/init.js`.

## Bulk Order Status Recovery

`recoverStuckBulkOrderStatusItems.js` recovers bulk async order-status items that are stuck in `processing`.

### When it runs

- Schedule env: `BULK_ORDER_STATUS_RECOVERY_CRON`
- Default: `*/5 * * * *` (every 5 minutes)

### What it does

1. Scans `bulk_order_status_job_items` where `status = processing` and `updated_at` is stale.
2. If the order is already at target status or already has a ShipStation ID (for packed jobs), marks the item `skipped` instead of re-processing.
3. If attempts are below max:
   - sets item back to `pending`
   - increments `attempts`
   - re-enqueues item to SQS
4. If attempts are exhausted:
   - marks item as `failed`
   - increments parent job `failed`
   - runs job finalization (`finalizeJobIfComplete`)

Also runs **pending recovery**: re-enqueues items stuck in `pending` longer than `BULK_ORDER_STATUS_PENDING_STALE_MINUTES`.

### Activation rules

Recovery runs only when:

- `BULK_ORDER_STATUS_DELIVERY_MODE=async_sqs`
- `BULK_ORDER_STATUS_SQS_QUEUE_URL` is configured

If these are not set, the cron exits safely without processing.

### Required env vars

- `BULK_ORDER_STATUS_DELIVERY_MODE=async_sqs`
- `BULK_ORDER_STATUS_SQS_QUEUE_URL`

### Optional tuning env vars

- `BULK_ORDER_STATUS_CLAIM_STALE_MINUTES` (default: `3`) — reclaim `processing` items in the API before cron recovery
- `BULK_ORDER_STATUS_STALE_RESET_MINUTES` (default: `15`)
- `BULK_ORDER_STATUS_PENDING_STALE_MINUTES` (default: `10`)
- `BULK_ORDER_STATUS_MAX_ATTEMPTS` (default: `5`)
- `BULK_ORDER_STATUS_RECOVERY_CRON` (default: `*/5 * * * *`)
- `BULK_ORDER_STATUS_RECOVERY_BATCH_LIMIT` (default: `500`)
- `BULK_ORDER_STATUS_JOB_RETENTION_DAYS` (default: `7`) — list/get job APIs omit older jobs

## Related workers/routes

- Worker: `backend/workers/bulkOrderStatusSqsWorker.js`
- Internal route: `POST /api/internal/bulk-order-status/process-item`
- Internal route: `POST /api/internal/bulk-order-status/release-item` (worker calls on HTTP timeout to reset stuck `processing` items)
- API queue endpoint: `POST /api/admin/orders/bulk-status/async`
- Job status endpoint: `GET /api/admin/orders/bulk-status/jobs/:id`
- List jobs: `GET /api/admin/orders/bulk-status/jobs`
  - Default: today's jobs (calendar day). Query: `date=today` | `date=all` (retention window) | `start_date` & `end_date` (ISO dates)
- Per-order job items: `GET /api/admin/orders/bulk-status/jobs/:id/orders`
- Active in-flight orders: `GET /api/admin/orders/bulk-status/active-orders`
