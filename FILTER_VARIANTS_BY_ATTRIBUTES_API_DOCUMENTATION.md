# filterVariantsByAttributes Function Documentation

## Overview
The `filterVariantsByAttributes` function is an optimized API endpoint that filters product variants based on attribute terms or variant slugs. It returns detailed product information along with filtered variants, available attribute terms, and comprehensive product metadata.

**Endpoint:** `POST /api/product/filter-variants`  
**Location:** `backend/components/product/domain/product.controller.js` (lines 1717-2517)

---

## Input Parameters

### Request Body
```json
{
  "product_id": 123,                    // Required: Integer - Product ID to filter
  "attribute_terms": [                  // Optional: Array of attribute-term pairs
    {
      "attribute_id": 1,                // Integer - Attribute ID
      "term_id": 5                      // Integer - Term ID
    }
  ],
  "slugs": "variant-slug-123"           // Optional: String - Variant slug (alternative to attribute_terms)
}
```

### Validation Rules
- `product_id` is required and must be an integer
- Either `attribute_terms` OR `slugs` must be provided (not both required, but at least one)
- If `attribute_terms` is provided, it must be an array with objects containing `attribute_id` and `term_id`
- If `slugs` is provided, it must be a non-empty string

---

## Processing Flow

### Phase 1: Product Validation (Lines 1729-1746)
1. **Fetch Product Basic Info**
   - Uses raw SQL query for performance
   - Validates product exists, is published, and not deleted
   - Returns 404 if product not found

### Phase 2: Slug to Attribute Terms Conversion (Lines 1748-1798)
If `slugs` parameter is provided instead of `attribute_terms`:
1. **Find Variant by Slug**
   - Queries `product_variants` table for matching slug
   - Validates variant exists and is active
   - Returns 404 if variant not found

2. **Extract Attribute Terms**
   - Fetches all attributes and terms associated with the found variant
   - Converts variant attributes to `attribute_terms` format
   - This allows the function to work with either input format

### Phase 3: Parallel Data Fetching - Batch 1 (Lines 1800-1876)
Fetches independent product-related data in parallel (no variant dependencies):
- **Categories**: Product categories with primary flag
- **Brands**: Product brands with primary flag
- **Product Images**: All images for the product
- **Product Attribute Terms**: All available attribute terms for the product
- **Deals**: Active deals associated with the product

### Phase 4: Variant Fetching (Lines 1878-1896)
1. **Get All Active Variants**
   - Fetches all active variants for the product
   - Uses raw SQL for performance
   - Filters by `status = 'active'` and `deleted_at IS NULL`

### Phase 5: Parallel Data Fetching - Batch 2 (Lines 1898-1934)
Fetches variant-dependent data in parallel:
- **Variant Attributes**: All attributes and terms for each variant
- **Variant Images**: All images for each variant

### Phase 6: Parallel Data Fetching - Batch 3 (Lines 1936-1960)
Fetches additional product metadata:
- **Loyalty Settings**: Active loyalty points configuration
- **Reviews**: All reviews for the product with user and order information

### Phase 7: Data Processing & Structure Building (Lines 1962-2016)
1. **Create Variant Attributes Map**
   - Groups variant attributes by variant ID for efficient lookup
   - Structures data with attribute and term objects

2. **Create Variant Images Map**
   - Groups variant images by variant ID
   - Includes metadata (alt_text, is_primary, sort_order)

3. **Build Structured Variants**
   - Combines variant data with attributes and images
   - Creates complete variant objects ready for filtering

### Phase 8: Attribute Terms Grouping (Lines 2018-2078)
1. **Group Product Attribute Terms**
   - Organizes attributes and their terms
   - Tracks which variants use each term (variant_slugs)
   - Handles `used_in_variation` flag logic
   - Only includes terms that have associated variants if `used_in_variation` is true

### Phase 9: Variant Filtering (Lines 2080-2108)
1. **Filter Variants by Attribute Terms**
   - If `processedAttributeTerms` exists, filters variants that match ALL provided attribute-term pairs
   - Uses `every()` to ensure all filter criteria are met
   - If no filter provided, returns all variants

2. **Slug Validation**
   - If `slugs` was provided, ensures exactly one variant matches
   - Returns error if multiple or zero variants match

### Phase 10: Available Terms Calculation (Lines 2110-2161)
1. **Calculate Available Terms for Other Attributes**
   - For each filtered variant, collects terms from attributes NOT in the filter
   - Tracks variant slugs for each term
   - Updates stock status and availability per term
   - Converts Maps to arrays for response

### Phase 11: Stock Summary (Lines 2163-2171)
Calculates stock statistics:
- Total variants
- In stock count
- Low stock count (stock <= threshold)
- Out of stock count

### Phase 12: Reviews Processing (Lines 2173-2223)
1. **Process Reviews**
   - Single-pass processing for efficiency
   - Calculates statistics simultaneously:
     - Total reviews
     - Average rating (rounded to 1 decimal)
     - Rating distribution (1-5 stars)
     - Verified reviews count
     - Testimonials count

### Phase 13: Puff Count Extraction (Lines 2249-2315)
1. **Extract Puff Count**
   - If filtered attributes include "number-of-puffs", uses that specific value
   - Otherwise, finds the largest puff count from all product attribute terms
   - Handles "up to" format (e.g., "up to 5000" → "~5000 puffs")
   - Returns formatted string or term name

### Phase 14: Min Price Variant Calculation (Lines 2316-2339)
1. **Transform Variants for Helper Function**
   - Converts raw SQL results to format expected by `getMinPriceVariant()`
   - Sets up product images for fallback
   - Calculates minimum price variant

### Phase 15: Final Variant Preparation (Lines 2340-2383)
1. **Structure Final Variants**
   - Maps filtered variants to response format
   - Includes:
     - Pricing information
     - Stock status
     - Primary and all images
     - Attributes with full details
     - Product categories and brands
     - Product description

### Phase 16: Filtered Attribute Terms Preparation (Lines 2394-2459)
1. **Build Filtered Attribute Terms Response**
   - For each filtered attribute, collects all available terms
   - Tracks variant slugs for each term
   - Marks selected term with `is_selected: true`
   - Includes full attribute and term details

### Phase 17: Response Assembly (Lines 2461-2511)
Assembles final response with:
- **Product**: Complete product information
- **Variants**: Filtered variants array
- **Available Terms**: Terms available for other attributes
- **Filtered Attribute Terms**: Full details of filtered attributes
- **Stock Summary**: Stock statistics

---

## Response Structure

### Success Response (200)
```json
{
  "success": true,
  "message": "Variants filtered successfully",
  "data": {
    "product": {
      "id": 123,
      "name": "Product Name",
      "slug": "product-slug",
      "description": "Product description",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "category": {
        "id": 1,
        "name": "Category Name",
        "slug": "category-slug"
      },
      "brand": {
        "id": 1,
        "name": "Brand Name",
        "slug": "brand-slug"
      },
      "product_categories": [
        {
          "id": 1,
          "name": "Category Name",
          "slug": "category-slug"
        }
      ],
      "product_brands": [
        {
          "id": 1,
          "name": "Brand Name",
          "slug": "brand-slug"
        }
      ],
      "primary_image": {
        "id": 1,
        "url": "https://example.com/image.jpg",
        "is_primary": true
      },
      "all_images": [
        {
          "id": 1,
          "url": "https://example.com/image.jpg",
          "is_primary": true
        }
      ],
      "attribute_terms": [
        {
          "attribute": {
            "id": 1,
            "name": "Color",
            "type": "select",
            "image_url": "https://example.com/attr.jpg",
            "is_visible_page": true,
            "used_in_variation": true
          },
          "terms": [
            {
              "id": 1,
              "name": "Red",
              "slug": "red",
              "used_in_variation": true,
              "is_visible_page": true,
              "variant_slugs": ["variant-1", "variant-2"]
            }
          ]
        }
      ],
      "deals": [
        {
          "id": 1,
          "name": "Deal Name",
          "slug": "deal-slug",
          "description": "Deal description",
          "deal_type": "buy_x_get_y",
          "required_qty": 2,
          "get_qty": 1,
          "fixed_price": null,
          "discount_percent": 10,
          "tiered_qty_json": null,
          "valid_from": "2024-01-01T00:00:00.000Z",
          "valid_to": "2024-12-31T23:59:59.000Z"
        }
      ],
      "loyaltySettings": {
        "program_name": "Loyalty Program",
        "points_value": 0.1,
        "loyalty_amount": 100,
        "loyalty_amount_type": "percentage",
        "minimum_points_redemption": 100,
        "minimum_purchase_amount": 50,
        "min_amount_for_loyalty_points": 10,
        "status": true
      },
      "flavors": [],
      "flavor_count": 0,
      "puff_count": "5000 puffs",
      "price": 99.99,
      "regular_price": 129.99,
      "discount_price": 99.99,
      "min_price_variant": {
        "id": 1,
        "slug": "variant-slug",
        "price": 99.99,
        "regular_price": 129.99,
        "discount_price": 99.99,
        "stock": 50,
        "stock_status": "in_stock",
        "status": "active",
        "variantImages": []
      },
      "reviews": [
        {
          "id": 1,
          "user_id": 10,
          "order_id": 20,
          "user_name": "John Doe",
          "company_name": "Company Inc",
          "rating": 5,
          "comment": "Great product!",
          "verified_by": "admin",
          "testimonial": true,
          "created_at": "2024-01-01T00:00:00.000Z",
          "user": {
            "first_name": "John",
            "last_name": "Doe",
            "profile_pic_url": "https://example.com/profile.jpg"
          },
          "order": {
            "order_unique_id": "ORD-12345"
          }
        }
      ],
      "review_stats": {
        "total_reviews": 10,
        "average_rating": 4.5,
        "rating_distribution": {
          "1": 0,
          "2": 1,
          "3": 2,
          "4": 3,
          "5": 4
        },
        "verified_reviews": 8,
        "testimonials": 2
      }
    },
    "variants": [
      {
        "id": 1,
        "slug": "variant-slug",
        "price": 99.99,
        "regular_price": 129.99,
        "discount_price": 99.99,
        "stock": 50,
        "stock_status": "in_stock",
        "status": "active",
        "description": "Variant description",
        "is_in_stock": true,
        "primary_image": {
          "id": 1,
          "url": "https://example.com/variant-image.jpg",
          "alt_text": "Variant image",
          "is_primary": true,
          "sort_order": 1
        },
        "all_images": [
          {
            "id": 1,
            "url": "https://example.com/variant-image.jpg",
            "alt_text": "Variant image",
            "is_primary": true,
            "sort_order": 1
          }
        ],
        "attributes": [
          {
            "attribute_id": 1,
            "attribute_name": "Color",
            "attribute_image_url": "https://example.com/color.jpg",
            "term_id": 1,
            "term_name": "Red",
            "term_slug": "red"
          }
        ],
        "created_at": "2024-01-01T00:00:00.000Z",
        "updated_at": "2024-01-01T00:00:00.000Z",
        "product_categories": [
          {
            "id": 1,
            "name": "Category Name",
            "slug": "category-slug"
          }
        ],
        "product_brands": [
          {
            "id": 1,
            "name": "Brand Name",
            "slug": "brand-slug"
          }
        ],
        "product_description": "Product description text"
      }
    ],
    "available_terms": [
      {
        "attribute": {
          "id": 2,
          "name": "Size",
          "type": "select",
          "image_url": "https://example.com/size.jpg"
        },
        "terms": [
          {
            "id": 10,
            "name": "Large",
            "slug": "large",
            "stock_status": "in_stock",
            "is_in_stock": true,
            "variant_slugs": ["variant-1"]
          }
        ]
      }
    ],
    "filtered_attribute_terms": [
      {
        "attribute": {
          "id": 1,
          "name": "Color",
          "type": "select",
          "image_url": "https://example.com/color.jpg"
        },
        "terms": [
          {
            "id": 1,
            "name": "Red",
            "slug": "red",
            "description": "",
            "is_selected": true,
            "variant_slugs": ["variant-1", "variant-2"]
          },
          {
            "id": 2,
            "name": "Blue",
            "slug": "blue",
            "description": "",
            "is_selected": false,
            "variant_slugs": ["variant-3"]
          }
        ]
      }
    ],
    "stock_summary": {
      "total": 5,
      "in_stock": 4,
      "low_stock": 1,
      "out_of_stock": 1
    }
  }
}
```

### Error Responses

#### 404 - Product Not Found
```json
{
  "success": false,
  "message": "Product not found",
  "error": {
    "message": "Product not found"
  }
}
```

#### 404 - Variant Not Found
```json
{
  "success": false,
  "message": "Variant not found for the provided slug",
  "error": {
    "message": "Variant not found for the provided slug"
  }
}
```

#### 400 - Multiple Variants Found
```json
{
  "success": false,
  "message": "Multiple variants found with the same slug",
  "error": {
    "message": "Multiple variants found with the same slug"
  }
}
```

#### 400 - No Attributes Found
```json
{
  "success": false,
  "message": "No attributes or terms found for this variant",
  "error": {
    "message": "No attributes or terms found for this variant"
  }
}
```

---

## Key Features & Optimizations

### 1. **Performance Optimizations**
- **Raw SQL Queries**: Uses raw SQL instead of ORM for maximum performance
- **Parallel Execution**: Groups queries into batches that can run in parallel:
  - Batch 1: Independent product data (categories, brands, images, etc.)
  - Batch 2: Variant-dependent data (variant attributes, images)
  - Batch 3: Additional metadata (loyalty, reviews)
- **Single-Pass Processing**: Reviews processed in one loop with statistics calculated simultaneously
- **Efficient Data Structures**: Uses Maps for O(1) lookups instead of nested loops

### 2. **Flexible Input Handling**
- Supports two input methods:
  - **Attribute Terms**: Direct attribute-term pairs
  - **Slug**: Variant slug (converted to attribute terms internally)
- Automatic conversion between formats

### 3. **Comprehensive Data Aggregation**
- Collects all product-related data in minimal queries
- Groups and structures data efficiently
- Tracks variant slugs for each term to enable frontend navigation

### 4. **Smart Filtering Logic**
- Filters variants that match ALL provided attribute terms (AND logic)
- Calculates available terms for other attributes based on filtered variants
- Handles edge cases (no variants, multiple variants, etc.)

### 5. **Rich Metadata**
- Stock summaries and availability
- Review statistics with distribution
- Puff count extraction with smart formatting
- Deal information
- Loyalty points settings

### 6. **Data Integrity**
- Validates product exists and is published
- Validates variant exists and is active
- Handles deleted records properly
- Ensures data consistency

---

## Use Cases

1. **Product Detail Page**: Filter variants when user selects attribute combinations
2. **Variant Navigation**: Get available options when a variant is selected
3. **Slug-Based Lookup**: Find variant details using variant slug
4. **Stock Management**: Get stock summary for filtered variants
5. **Review Display**: Show product reviews and statistics

---

## Database Tables Used

- `products` - Product basic information
- `product_variants` - Variant information
- `product_variant_attributes` - Variant-attribute-term relationships
- `product_variant_images` - Variant images
- `product_categories` - Product-category relationships
- `product_brands` - Product-brand relationships
- `product_images` - Product images
- `product_attribute_terms` - Product-attribute-term relationships
- `attributes` - Attribute definitions
- `attribute_terms` - Term definitions
- `categories` - Category information
- `brands` - Brand information
- `deal_products` - Product-deal relationships
- `deals` - Deal information
- `reviews` - Product reviews
- `users` - User information (for reviews)
- `orders` - Order information (for reviews)
- `loyalty_points_settings` - Loyalty program settings

---

## Dependencies

- **Models**: Product, Category, Brand, ProductImage, ProductVariant, ProductVariantImage, ProductVariantAttribute, Deal, DealProduct, ProductCategory, ProductBrand, LoyaltyPointsSettings, Review, User, Order
- **Helpers**: `getMinPriceVariant()` from `product.helper`
- **Utils**: `errorResponse()`, `successResponse()` from `responseUtils`
- **Logger**: For error logging

---

## Error Handling

All errors are caught, logged, and returned as error responses with appropriate HTTP status codes:
- **404**: Resource not found (product, variant)
- **400**: Invalid input or multiple matches
- **500**: Internal server errors (caught and logged)

---

## Algorithm Details

### Variant Filtering Algorithm
```javascript
// Filters variants that match ALL attribute terms (AND logic)
filteredVariants = structuredVariants.filter(variant => {
    return processedAttributeTerms.every(filter => {
        return variant.variantAttributes.some(va => 
            va.attribute.id === filter.attribute_id && 
            va.term.id === filter.term_id
        );
    });
});
```

### Available Terms Calculation
- Iterates through filtered variants
- Collects terms from attributes NOT in the filter
- Tracks variant slugs for each term
- Updates stock status based on variant availability

### Puff Count Extraction
1. Check if filtered attributes include "number-of-puffs"
2. If yes, use that specific term's value
3. If no, find largest puff count from all product attribute terms
4. Format: "up to X" → "~X puffs", otherwise use term name

---

## Notes

- The function is optimized for performance with strategic use of raw SQL and parallel queries
- It handles both attribute-based and slug-based filtering seamlessly
- All timestamps are returned in ISO 8601 format
- Stock calculations consider `low_stock_threshold` for accurate low stock detection
- Puff count extraction handles various formats including "up to" patterns
- The function maintains backward compatibility while supporting new slug-based filtering
- All database queries use parameterized statements to prevent SQL injection

---

## Example cURL Requests

### Using Attribute Terms
```bash
curl -X POST http://localhost:3000/api/product/filter-variants \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": 123,
    "attribute_terms": [
      {
        "attribute_id": 1,
        "term_id": 5
      },
      {
        "attribute_id": 2,
        "term_id": 10
      }
    ]
  }'
```

### Using Variant Slug
```bash
curl -X POST http://localhost:3000/api/product/filter-variants \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": 123,
    "slugs": "variant-red-large"
  }'
```

---

## Performance Considerations

- **Query Count**: Minimized to ~8-10 queries total (with parallel execution)
- **Data Processing**: Single-pass algorithms where possible
- **Memory Usage**: Uses Maps for efficient lookups, converts to arrays only at response time
- **Response Time**: Optimized for sub-200ms response times on typical datasets

---

## Future Enhancements

Potential improvements:
1. Add caching layer for frequently accessed products
2. Implement pagination for reviews
3. Add support for variant comparison
4. Include related products in response
5. Add variant availability predictions

