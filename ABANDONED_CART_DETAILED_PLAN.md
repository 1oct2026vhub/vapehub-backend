# Abandoned Cart System - Detailed Implementation Plan

## Final Decisions
- Trigger cohort: `Order.status = pending`
- Email #1: send at +2h if still pending
- Email #2: send at +24h if still pending
- Email #2 discount: unique 10% code, manual copy/apply
- Coupon expiry: 48h after Email #2 send
- CTA destination: `{{FRONTEND_URL}}/checkout`
- No coupon auto-apply URL behavior

---

## 1) Trigger Logic (Abandoned Definition)

### Eligibility Rules
- First reminder eligible when:
  - `now - order.createdAt >= 2 hours`
  - order still `pending`
  - first email not already sent
- Second reminder eligible when:
  - `now - order.createdAt >= 24 hours`
  - order still `pending`
  - second email not already sent
- Auto-cancel eligible when:
  - `now - order.createdAt >= 48 hours`
  - order still `pending`
  - not already cancelled by automation

### Timestamp Source
- Use `Order.createdAt` as baseline.
- Future enhancement: derive pending start from `OrderLog` status transitions.

---

## 2) Tracking Table (Idempotency + Reporting)

### Table
- Model: `AbandonedCartFlow`
- Table: `abandoned_cart_flows`
- One row per order (`order_id` unique)

### Minimum Fields
- `order_id` (FK -> orders.id, unique)
- `user_id` (FK -> users.id, nullable)
- `order_unique_id` (denormalized)
- `customer_email` (denormalized)
- `first_email_sent_at` (nullable)
- `second_email_sent_at` (nullable)
- `second_discount_code` (nullable)
- `coupon_id` (FK -> coupons.id, nullable)
- `cancelled_at` (nullable)
- `recovered_at` (nullable)
- `recovered_revenue` (decimal, nullable)
- `status` enum: `entered | email1_sent | email2_sent | recovered | cancelled | failed`
- `last_error` (nullable text)

### Optional
- `email1_provider_message_id`, `email2_provider_message_id`

### Why Required
- Prevent duplicate sends on repeated cron runs.
- Preserve email/recovery history after order status changes.
- Power admin reporting.

---

## 3) Email Template Support

### Add Email Types
- `ABANDONED_CART_REMINDER_1`
- `ABANDONED_CART_REMINDER_2`

### Add emailTypeData
- folderName:
  - `abandoned_cart/reminder_1`
  - `abandoned_cart/reminder_2`
- Branded subject lines.

### Templates
- `backend/emailTemplates/abandoned_cart/reminder_1/html.hbs`
- `backend/emailTemplates/abandoned_cart/reminder_1/text.hbs`
- `backend/emailTemplates/abandoned_cart/reminder_2/html.hbs`
- `backend/emailTemplates/abandoned_cart/reminder_2/text.hbs`

### Content Requirements
- Strong header/footer with logo.
- Branded colors and typography.
- Clear CTA button to checkout.
- Email #2 coupon block:
  - copy-friendly monospace
  - "expires in 48 hours"
  - one-time use notice

---

## 4) Coupon Generation for Email #2

### Coupon Rules
- `discount_type = percentage`
- `discount_value = 10`
- `status = active`
- `is_single_use = true`
- `usage_limit = 1`
- `coupon_user = order.user_id` (or temp guest user ID)
- `start_date = now`
- `end_date = now + 48h`

### Persist in Flow
- `coupon_id`
- `second_discount_code`

### Compatibility
- Existing validator already enforces `coupon_user` ownership and single-use behavior.

---

## 5) Cron Automation

### File
- `backend/cron/abandonedCart.js`
- Register in `backend/cron/init.js`

### Jobs
1. **2h reminder sender**
   - pending + 2h + first not sent
2. **24h reminder sender**
   - pending + 24h + second not sent
   - generate unique coupon before send
3. **48h auto-canceller**
   - pending + 48h + not cancelled

### Per-Record Safety
- Re-check current order status before each action.
- Update flow timestamps/status only after successful action.
- On errors, set `status=failed` and capture `last_error`.

### Idempotency Source of Truth
- `first_email_sent_at`, `second_email_sent_at`, `cancelled_at` in flow table.

---

## 6) Recovery Detection (Recovered Revenue)

### Preferred Mechanism
- Hook into order status change (`Order.afterUpdate` flow).
- If status moves from pending to fulfilment states (`processing`+):
  - set `recovered_at`
  - set `recovered_revenue = order.total`
  - set flow status `recovered`

### Why
- Immediate and accurate; avoids delayed cron reconciliation.

---

## 7) Admin Tab + APIs

### Route Group
- Mount under: `/api/admin/abandoned-carts`
- Require admin auth middleware.

### Endpoints
1. `GET /api/admin/abandoned-carts`
   - filters: `start_date`, `end_date`, `page`, `limit`, `status`, `search`
   - returns list with order + email statuses.
2. `GET /api/admin/abandoned-carts/:orderId`
   - detailed view for one order flow.
3. `GET /api/admin/abandoned-carts/summary?period=daily|weekly|monthly|yearly`
   - aggregated KPI response.

### KPI Contract
- `abandoned_carts`
- `emails_sent_1`
- `emails_sent_2`
- `recovered_orders`
- `recovered_revenue`
- `recovery_rate`
- `auto_cancelled_orders`

### Metric Definition (lock this)
- Recommend: `abandoned_carts = count(flows entered)`.

---

## 8) Branding Standards

### Design Goals
- Improve beyond plain legacy templates.
- Consistent shell between reminder 1 and reminder 2.
- Strong CTA hierarchy and spacing.
- Coupon section visually prominent in reminder 2.

### Variables in Template Context
- `FRONTEND_URL`
- `ctaUrl`
- `customerName`
- `discountCode` (email #2)
- `currentYear`
- `host` (for logo URL)

---

## 9) QA Plan

### Scenarios
1. Paid before 2h:
   - no email, not abandoned.
2. Paid between 2h and 24h:
   - email #1 sent once
   - email #2 not sent
3. Pending beyond 24h:
   - email #2 sent once
   - coupon exists and user-bound
4. Pending beyond 48h:
   - status auto-updated to `cancel`
   - no duplicate cancellation records
5. Repeated cron runs:
   - no duplicate email sends
6. Recovery:
   - flow marked recovered when payment progresses
7. Admin reporting:
   - summary values match raw flow records

### Operational Checks
- Log failures per order/flow.
- Validate timezone consistency (`Europe/London`).
- Verify template rendering in both HTML and text modes.

---

## 10) Rollout Notes

### Phase 1
- Deploy tracking + cron + templates + admin APIs.
- Observe logs for 48-72 hours.

### Phase 2 (optional)
- Add provider message IDs for deeper email deliverability tracing.
- Add cancellation customer email if business wants explicit notice.
