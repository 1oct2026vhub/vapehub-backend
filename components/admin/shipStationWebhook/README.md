# ShipStation Webhook Integration

This module handles incoming webhooks from ShipStation to automatically update order statuses in the system.

## Webhook Events

The following ShipStation webhook events are supported:

| Event | Description | Order Status Update |
|-------|-------------|-------------------|
| `ORDER_NOTIFY` | Order has been created/updated in ShipStation | `processing` |
| `ITEM_ORDER_NOTIFY` | Order items are being processed | `packed` |
| `SHIP_NOTIFY` | Order has been shipped | `shipped` |
| `ITEM_SHIP_NOTIFY` | Order items are out for delivery | `out_for_delivery` |
| `FULFILLMENT_SHIPPED` | Order has been delivered | `delivered` |
| `FULFILLMENT_REJECTED` | Order fulfillment was rejected | `fail` |

## Setup Instructions

### 1. Configure Environment Variables

Ensure the following environment variables are set:

```env
SHIPSTATION_API_KEY=your_shipstation_api_key
SHIPSTATION_SECRET_KEY=your_shipstation_secret_key
```

### 2. Subscribe to Webhooks

Use the webhook subscription endpoint to register for the desired events:

```bash
POST /api/admin/shipStationWebhook
Content-Type: application/json

{
  "target_url": "https://your-domain.com/api/admin/shipStationWebhook/webhook",
  "event": "ORDER_NOTIFY",
  "friendly_name": "Order Status Updates"
}
```

### 3. Webhook Endpoint

The webhook endpoint is available at:

```
POST /api/admin/shipStationWebhook/webhook
```

This endpoint:
- Does not require authentication (ShipStation calls it directly)
- Always returns HTTP 200 to acknowledge receipt
- Processes webhooks asynchronously
- Logs all activities for debugging

## Order Mapping

The system maps ShipStation orders to internal orders using the `order_unique_id` field. When creating orders in ShipStation, the `orderNumber` should be set to the internal `order_unique_id`.

## Error Handling

- If an order is not found, the webhook is logged but no error is returned
- If the webhook processing fails, it's logged but a 200 response is still returned to prevent retries
- All webhook activities are logged for debugging purposes

## Testing

You can test the webhook endpoint with a sample payload:

```bash
curl -X POST https://your-domain.com/api/admin/shipStationWebhook/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "SHIP_NOTIFY",
    "resource_type": "ORDER",
    "resource_url": "https://ssapi.shipstation.com/orders/ORD-12345678"
  }'
```

## Monitoring

Check the application logs for webhook-related entries:

- `Received ShipStation webhook` - When a webhook is received
- `Order status updated to [status] via webhook` - When an order status is updated
- `Could not extract order ID from URL` - When URL parsing fails
- `Order not found for ShipStation order ID` - When order mapping fails 