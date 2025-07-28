# Enhanced Deal Filtering Documentation

## Overview

The `fetchProducts` function has been enhanced to support comprehensive deal filtering. This allows you to filter products by deals and provides deal filter parameters for the frontend filter section.

## Key Features

### 1. Deal-Based Product Filtering
- Filter products by specific deal ID using `deal_id` parameter
- Only shows products that are part of active, valid deals
- Supports all existing filters (categories, brands, price ranges, etc.) in combination with deal filtering

### 2. Deal Filter Parameters for Frontend
- Returns `deal_items` array with all available deals and their product counts
- Each deal includes complete deal information (type, requirements, pricing, etc.)
- Product counts are calculated based on current filter context

### 3. Cross-Filter Integration
- Deal filtering works seamlessly with all other filters
- Category, brand, and attribute counts are calculated considering deal context
- Price range counts reflect products available in deals

## API Usage

### Basic Deal Filtering

```javascript
// Filter products by specific deal
const result = await fetchProducts({
  deal_id: 1,
  limit: 10,
  offset: 0
});

console.log(result.products); // Products in deal
console.log(result.deal_items); // Available deals for filtering
```

### Deal Filtering with Additional Filters

```javascript
// Filter products by deal with category and brand filters
const result = await fetchProducts({
  deal_id: 1,
  categories: '1,2,3',
  brand: '1,2',
  price_range: '10-50',
  limit: 10,
  offset: 0
});
```

### Get All Available Deals

```javascript
// Get all available deals without filtering by specific deal
const result = await fetchProducts({
  limit: 10,
  offset: 0
});

console.log(result.deal_items); // All active deals with product counts
```

## Response Structure

### Main Response Object
```javascript
{
  additionalData: {}, // Context-specific data (category, brand, or deal info)
  products: [], // Filtered products
  category_items: [], // Available categories with counts
  brand_items: [], // Available brands with counts
  deal_items: [], // Available deals with counts
  attributes: [], // Available attributes and terms with counts
  price_ranges: [], // Available price ranges with counts
  pagination: {} // Pagination information
}
```

### Deal Items Structure
```javascript
{
  id: 1,
  name: "Buy 2 Get 1 Free",
  slug: "buy-2-get-1-free",
  deal_type: "bogo",
  required_qty: 2,
  get_qty: 1,
  fixed_price: null,
  discount_percent: null,
  tiered_qty_json: null,
  valid_from: "2024-01-01T00:00:00.000Z",
  valid_to: "2024-12-31T23:59:59.000Z",
  product_count: 15 // Number of products in this deal
}
```

### Additional Data for Deal Source
```javascript
{
  id: 1,
  name: "Buy 2 Get 1 Free",
  slug: "buy-2-get-1-free",
  deal_type: "bogo",
  required_qty: 2,
  get_qty: 1,
  fixed_price: null,
  discount_percent: null,
  tiered_qty_json: null,
  valid_from: "2024-01-01T00:00:00.000Z",
  valid_to: "2024-12-31T23:59:59.000Z"
}
```

## Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `deal_id` | number | Filter products by specific deal ID | `1` |
| `categories` | string | Filter by category IDs (comma-separated) | `"1,2,3"` |
| `brand` | string | Filter by brand IDs (comma-separated) | `"1,2"` |
| `price_range` | string | Filter by price range | `"10-50"` or `"200+"` |
| `keyword` | string | Search products by name | `"vape"` |
| `variant` | object/string | Filter by variant attributes | `{"12": [477]}` |
| `is_new` | boolean | Filter for new products (last 30 days) | `true` |
| `source` | string | Source context for additional data | `"deal"` |

## Frontend Integration

### Deal Filter Component
```javascript
// Example React component for deal filtering
const DealFilter = ({ deals, selectedDeal, onDealChange }) => {
  return (
    <div className="deal-filter">
      <h3>Deals</h3>
      {deals.map(deal => (
        <label key={deal.id}>
          <input
            type="radio"
            name="deal"
            value={deal.id}
            checked={selectedDeal === deal.id}
            onChange={(e) => onDealChange(e.target.value)}
          />
          {deal.name} ({deal.product_count} products)
        </label>
      ))}
    </div>
  );
};
```

### API Call with Deal Filter
```javascript
const fetchProductsWithDeal = async (dealId) => {
  const response = await fetch(`/api/products?deal_id=${dealId}`);
  const data = await response.json();
  
  return {
    products: data.products,
    filters: {
      categories: data.category_items,
      brands: data.brand_items,
      deals: data.deal_items,
      attributes: data.attributes,
      priceRanges: data.price_ranges
    }
  };
};
```

## Database Requirements

The enhanced functionality requires the following database tables and relationships:

1. **deals** table with fields:
   - `id`, `name`, `slug`, `deal_type`
   - `required_qty`, `get_qty`, `fixed_price`, `discount_percent`
   - `tiered_qty_json`, `valid_from`, `valid_to`
   - `is_active`, `is_deleted`

2. **deal_products** junction table with fields:
   - `deal_id`, `product_id`

3. **products** table with existing fields

4. **product_variants** table for price calculations

## Performance Considerations

1. **Indexing**: Ensure proper indexes on:
   - `deals.is_active`, `deals.is_deleted`, `deals.valid_from`, `deals.valid_to`
   - `deal_products.deal_id`, `deal_products.product_id`
   - `product_variants.product_id`, `product_variants.status`, `product_variants.price`

2. **Query Optimization**: The function uses CTEs (Common Table Expressions) for efficient filtering and counting

3. **Caching**: Consider caching deal information as deals don't change frequently

## Error Handling

The function includes comprehensive error handling for:
- Invalid deal IDs
- Malformed query parameters
- Database connection issues
- Missing required relationships

## Testing

Use the provided test file `test_deal_filtering.js` to verify functionality:

```bash
node backend/test_deal_filtering.js
```

This will run various test scenarios to ensure the deal filtering works correctly with different combinations of filters. 