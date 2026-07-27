# Handoff: `hide_variant_selector` & variant name display

**Date:** Jul 2026  
**Repo:** `vape-hub` (backend)  
**Purpose:** Context to continue this work in a new chat.

---

## Goal

Identify products that have **exactly 1 active variant** whose attributes are **not shown on the page** (`is_visible_page: false`), so:

1. Frontend can **hide the variant picker** on PDP.
2. **Variant attribute names** are omitted from emails, ShipStation, and admin order UI when that case applies.

`is_visible_page` lives on `product_attribute_terms` (not on the variant itself).

---

## Final business rule

`hide_variant_selector = true` when:

1. Product has **exactly 1 active** variant, **and**
2. Every attribute linked to **that variant** has `is_visible_page: false` on `product_attribute_terms`  
   (or the variant has **no** attributes).

**Ignore** other product-level attributes that are `is_visible_page: true` but **not** on the variant (e.g. Battery/Flavour display attrs).

| Active variants | Visible attrs **on that variant** | Flag |
|-----------------|-----------------------------------|------|
| 1 | 0 (or no attrs) | `true` |
| 1 | ≥1 | `false` |
| ≥2 | any | `false` |

---

## API response fields (PDP)

```json
{
  "hide_variant_selector": true,
  "default_variant_id": 456,
  "default_variant_slug": "product-default"
}
```

FE: if `true` → hide picker; Add to Cart with `default_variant_id` / `default_variant_slug`.

### Surfaces that expose the flag

| Endpoint | Status |
|----------|--------|
| `filterVariantsByAttributes` (`POST /api/product/filter-variants`) | Done |
| Product by id (`getProductByid`) | Done |
| Product by slug (`listAllproductsBySlug`) | Done |
| Cart API | **Not added** (not needed for ATC; cart already has `variant_id`) |
| Customer order by id (`/api/order/:id`) | **Not enriched** |
| Admin order by id / list | Enriched |

---

## Key files

### Core logic
- `backend/components/product/helper/product.helper.js`  
  - `shouldHideVariantSelector(activeVariants, productAttributeTerms)`
- `backend/components/order/helper/orderItemDisplayName.helper.js`  
  - `loadOrderItemDisplayContext`  
  - `shouldHideVariantNameForOrderItem`  
  - `buildOrderItemDisplayName` (formats: `email` / `labeled`)  
  - `mapOrderItemsForEmail`  
  - `mapOrderItemsForShipStation`  
  - `enrichOrderItemsWithHideVariantSelector` (sets flag; clears `variantAttributes` when hide)

### Product APIs
- `backend/components/product/domain/product.controller.js`  
  - Imports `shouldHideVariantSelector`  
  - `/filter-variants`: loads **all** PATs (not only visible); builds `attribute_terms` for **all** attrs (FE uses `is_visible_page`); `available_terms` still visible + `used_in_variation`  
  - Slug API: extra query for `product_variant_attributes` for the flag

### Emails (omit hidden attrs from line names)
- `backend/components/payment/domain/worldpay.paidOrder.helper.js` → `mapOrderItemsForEmail`
- `backend/components/payment/domain/vivaWallet.controller.js` → `mapOrderItemsForEmail`
- `backend/components/admin/shipStationWebhook/domain/shipStationWebhook.controller.js` → shipped email via `mapOrderItemsForEmail`

### ShipStation order create (item name)
- `backend/components/admin/shipStation/domain/shipStation.controller.js` → `mapOrderItemsForShipStation`  
  - Format when showing attrs: `Product Name, Attr: Term`  
  - When hide: **product name only**

### Admin orders
- `backend/components/admin/order/domain/order.controller.js`  
  - `getOrderById` + `listAllOrders` call `enrichOrderItemsWithHideVariantSelector`  
  - When hide: `hide_variant_selector` on item/product; `variantAttributes` cleared to `[]`

---

## What was tried / refined

1. **First version:** flag = 1 variant + **no** product PATs with `is_visible_page: true` → wrong (Battery/Flavour visible blocked flag).  
2. **Final version:** only attrs on the **sole variant** matter.  
3. **filter-variants `attribute_terms`:** initially filtered to visible only; later changed to **list all** (with `is_visible_page` on each).  
4. Emails initially appended **all** variant terms; then filtered by `is_visible_page` / hide rule.

---

## Known gaps / follow-ups

1. **Admin UI still showing attrs** (e.g. `Number Of Puffs: …`) while ShipStation is correct  
   - Verify admin API JSON: `hide_variant_selector` + empty `variantAttributes`.  
   - If JSON is correct → admin FE bug / not reading cleared attrs.  
   - If JSON still has attrs → Sequelize `setDataValue` may not stick on nested association; may need to build a plain response object instead of `order.toJSON()` after mutate.

2. **Customer order by id** (`backend/components/order/domain/order.controller.js` `getOrderById`) does **not** call enrich — still returns all `variantAttributes`.

3. **Cart API** — no flag; optional if FE needs to hide attr labels on cart lines.

4. **Existing ShipStation orders** keep old names until re-created/synced; new Packed → ShipStation uses new naming.

5. **Product-by-id cache** (`cacheOrFetch`) — old payloads without flag until TTL expires.

6. **Loyalty-points confirmation email** — product name only already; no variant append.

7. **Cancellation emails** — typically no line items; unchanged.

---

## QA quick matrix

| Case | Expect |
|------|--------|
| 1 variant, variant attrs all `is_visible_page: false` | Flag `true`; PDP hide picker; email/SS/admin no attr suffix |
| 1 variant + product-level visible attrs not on variant | Flag still `true` |
| 1 variant, one variant attr visible | Flag `false`; show that attr |
| 2+ variants | Flag `false` |
| Staging example (historical) | product `347108` “New no variation product” |

---

## Example staging products discussed

- `product_id: 347108` — single variant, Tank Size on variant; Battery/Flavour product-level visible → should hide.  
- Orders like `ORD-FAA141358P`, `ORD-535508D36C` — “Product One Variant test” / “Test Product No variant”; ShipStation confirmed **no** variant name after fix.

---

## Suggested commit messages used / proposed

- Initial: hide_variant_selector on PDP/filter-variants  
- Fix: check only sole variant’s attributes  
- Emails: omit non-visible variant terms from confirmation/shipped  
- ShipStation + admin: omit variant names when hide applies  

---

## Prompt starter for next chat

> Continue work from `hide_variant_selector` handoff doc. ShipStation item names are correct (product name only when hide). Admin order detail may still show attribute lines like “Number Of Puffs” — investigate admin `getOrderById` enrich + `toJSON` / FE. Optionally add same enrich to customer `order.controller.getOrderById`. See handoff md for full context.
