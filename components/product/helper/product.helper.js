const crypto = require('crypto');
const { sequelize, Product, Category, Brand, ProductImage, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Order, Deal, DealProduct, ProductCategory, ProductBrand } = require("../../../models");
const { Sequelize, Op } = require("sequelize");
const { productVariants: { stockStatus } } = require("../../../config/constants");
const { cacheOrFetch, invalidateCachePattern } = require('../../../library/cache');

async function getTrendingProducts(limit = 10) {
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const trendingProducts = await sequelize.query(`
      SELECT 
        p.id, 
        p.name, 
        p.slug, 
        p.sku,
        p.price, 
        p.discount_price, 
        COUNT(DISTINCT o.id) AS order_count
      FROM 
        products p
      JOIN 
        order_items oi ON oi.product_id = p.id
      JOIN 
        orders o ON o.id = oi.order_id
      WHERE 
        o.createdAt BETWEEN :startOfMonth AND :endOfMonth
        AND p.status = 'published'
        AND o.status IN ('processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'completed')
        AND o.deletedAt IS NULL
      GROUP BY 
        p.id, p.name, p.slug, p.sku, p.price, p.discount_price
      ORDER BY 
        order_count DESC
      LIMIT :limit
    `, {
    replacements: { startOfMonth, endOfMonth, limit },
    type: sequelize.QueryTypes.SELECT,
  });

  return trendingProducts;
}
// Helper function to generate unique filename
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = originalName.split('.').pop();
  return `${timestamp}-${randomString}.${extension}`;
};

const fetchProducts2 = async (query) => {
  try {
    const { sort_by = 'id', order = 'ASC', limit = 10, offset = 0, keyword, price_range, categories, brands, flavours,
      // bottle_size, nicotine_strength, nicotine_type, vg_ratio, vaping_style, coil_style, puff_count, battery_capacity, device_style, eliquid_capacity, pod_coil_style
    } = query;

    // Parse limit and offset as integers
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);


    // Build the where clause for filtering
    let whereClause = {};

    if (keyword) {
      whereClause.name = { [Op.like]: `%${keyword}%` };
    }

    if (price_range) {
      const [minPrice, maxPrice] = price_range.split('-').map(Number);
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { price: { [Op.between]: [minPrice, maxPrice] } },
          Sequelize.literal(`EXISTS (
                  SELECT 1 FROM ProductFlavors 
                  WHERE ProductFlavors.product_id = Product.id 
                  AND ProductFlavors.price BETWEEN ${minPrice ?? 0} ${maxPrice ? `AND ${maxPrice}` : ''}
              )`)
        ]
      };
    }

    if (brands) {
      const brandIds = brands.split(',').map(Number);
      whereClause.id = {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT product_id 
          FROM product_brands 
          WHERE brand_id IN (${brandIds.join(',')})
        )`)
      };
    }
    if (categories) {
      const categoryIds = categories.split(',').map(Number);
      whereClause.id = {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT product_id 
          FROM product_categories 
          WHERE category_id IN (${categoryIds.join(',')})
        )`)
      };
    }

    if (flavours) {
      const flavorIds = flavours.split(',').map(Number);
      whereClause = {
        ...whereClause,
        [Op.and]: [
          Sequelize.literal(`EXISTS (
                  SELECT 1 FROM ProductFlavors 
                  WHERE ProductFlavors.product_id = Product.id 
                  AND ProductFlavors.flavor_id IN (${flavorIds})
              )`)
        ]
      };
    }

    const filterableFields = [
      'bottle_size', 'nicotine_strength', 'nicotine_type', 'vg_ratio',
      'vaping_style', 'coil_style', 'puff_count', 'battery_capacity',
      'device_style', 'eliquid_capacity', 'pod_coil_style', 'pod_fill_style',
    ];


    if (query.is_new) {
      // fetch last one month created product
      const lastMonthDate = new Date();
      lastMonthDate.setDate(lastMonthDate.getDate() - 30);
      whereClause.createdAt = { [Op.gte]: lastMonthDate };
    }


    filterableFields.forEach(field => {
      if (query[field]) {
        whereClause[field] = query[field];
      }
    });


    // Build the include clause for related models
    const includeClause = [
      { model: Category, as: 'Categories', through: { attributes: ['is_primary'] } },
      { model: Brand, as: 'Brands', through: { attributes: ['is_primary'] } },
      { model: ProductImage, as: 'ProductImages' },
      {
        model: Flavor, as: 'Flavors', through: {
          model: ProductFlavor,
        }
      },
      {
        model: Deal,
        as: 'deals',
        through: { 
          model: DealProduct,
          attributes: []
        },
        where: {
          is_active: true,
          is_deleted: false,
          valid_from: { [Op.lte]: new Date() },
          valid_to: { [Op.gte]: new Date() }
        },
        required: false,
        attributes: [
          'id', 
          'name', 
          'slug', 
          'deal_type', 
          'required_qty', 
          'get_qty', 
          'fixed_price', 
          'discount_percent', 
          'tiered_qty_json',
          'valid_from',
          'valid_to'
        ]
      }
    ];

    // If flavours are specified, filter by them
    if (flavours) {
      const flavorIds = flavours.split(',').map(Number);
      includeClause.push({
        model: Flavor,
        as: 'Flavors',
        where: { id: { [Op.in]: flavorIds } },
        through: { attributes: [] }
      });
    }

    // Fetch the total count of products matching the filters
    const totalCount = await Product.count({
      where: whereClause,
      include: includeClause,
      distinct: true // Ensure distinct counting for associations
    });

    // Calculate total pages
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / parsedLimit) : 1;

    // Calculate current page
    const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

    const pagination = {
      total_count: totalCount,
      total_pages: totalPages,
      current_page: currentPage,
      limit: parsedLimit,
      offset: parsedOffset
    }

    // Fetch the products with the applied filters
    const products = await Product.findAll({
      where: whereClause,
      include: includeClause,
      order: [[sort_by, order]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return { products, pagination }
  } catch (error) {
    throw error
  }
}

/**
 * Enhanced fetchProducts function with comprehensive filtering including deal filtering
 * @param {Object} query - Query parameters for filtering products
 * @param {string} status - Product status filter (default: 'published')
 * @returns {Object} Object containing products, filter options, and pagination
 * 
 * Query parameters:
 * - deal_id: Filter products by specific deal ID
 * - categories: Filter by category IDs (comma-separated)
 * - brand: Filter by brand IDs (comma-separated)
 * - price_range: Filter by price range (format: "min-max" or "200+")
 * - keyword: Search products by name
 * - variant: Filter by variant attributes
 * - is_new: Filter for new products (last 30 days)
 * - source: Source context ("category", "brand", "deal")
 */

const fetchProducts = async (query, status = 'published') => {
  try {
    const {
      sort_by = 'order_count',
      order,
      limit = 10,
      offset = 0,
      keyword,
      price_range,
      categories,
      brand,
      variant,
      is_new,
      source,
      deal_id
    } = query;
    // Default order: DESC for popularity/order_count, ASC for others
    const defaultOrder = (sort_by === 'popularity' || sort_by === 'order_count') ? 'DESC' : 'ASC';
    const orderValue = order || defaultOrder;
    // Parse limit and offset as integers
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    // Determine safe variant sort mapping to mirror original order
    const variantSortMap = { id: 'id', price: 'price', slug: 'slug', createdAt: 'created_at', updatedAt: 'updated_at' };
    const categorySortMap = { id: 'id', name: 'name', slug: 'slug' };
    const safeVariantSortBy = variantSortMap[sort_by] || 'id';
    const safeOrder = (String(orderValue).toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
    const safeCategorySortBy = categorySortMap[sort_by] || 'id';
    // Validate price range format
    let priceRange = null;
    if (price_range) {
      if (price_range === "200+") {
        priceRange = { min: 200, max: 999999 };
      } else {
        const [minPrice, maxPrice] = price_range.split('-').map(Number);
        if (isNaN(minPrice) || isNaN(maxPrice)) {
          throw new Error('Invalid price range format. Use format: min-max or "200+"');
        }
        priceRange = { min: minPrice, max: maxPrice };
      }
    }

    // Parse variant filter
    let variantFilters = {};
    let selectedAttributes = {};
    if (variant) {
      try {
        variantFilters = typeof variant === 'string' ? JSON.parse(variant) : variant;
        if (typeof variantFilters !== 'object') {
          throw new Error('Variant filter must be an object');
        }
      } catch (error) {
        throw new Error('Invalid variant filter format: must be valid JSON');
      }
    }
    // Also check for attributes parameter (used by deals route)
    if (!variant && query.attributes) {
      try {
        const attributesData = typeof query.attributes === 'string' ? JSON.parse(query.attributes) : query.attributes;
        variantFilters = { attributes: attributesData };
      } catch (error) {
        throw new Error('Invalid attributes filter format: must be valid JSON');
      }
    }
    
    // Check if variantFilters is directly an attributes object (format: {"12": [477], "15": [479]})
    // If so, wrap it in an attributes property
    if (variantFilters && !variantFilters.attributes && !variantFilters.id) {
      // Check if all keys are numeric (attribute IDs) and all values are arrays (term IDs)
      const isAttributeFormat = Object.entries(variantFilters).every(([key, value]) => {
        return !isNaN(key) && Array.isArray(value);
      });
      if (isAttributeFormat) {
        variantFilters = { attributes: variantFilters };
        selectedAttributes = variantFilters.attributes;
      }
    }
    else if (variantFilters && variantFilters.attributes && !variantFilters.id) {
      selectedAttributes = variantFilters.attributes;
    }
    // Ensure all term IDs are arrays and convert to numbers
    selectedAttributes = Object.entries(selectedAttributes).reduce((acc, [key, value]) => {
      const attributeId = parseInt(key);
      if (!isNaN(attributeId)) {
        acc[attributeId] = Array.isArray(value) ? value.map(v => parseInt(v)).filter(v => !isNaN(v)) : [parseInt(value)].filter(v => !isNaN(v));
      }
      return acc;
    }, {});

    // Build base where clause for Product
    const productWhereClause = {
      ...(keyword && { name: { [Op.like]: `%${keyword}%` } }),
      status: status,
      [Op.and]: [
        Sequelize.literal(`EXISTS (
          SELECT 1 
          FROM product_variants pv_active
          WHERE pv_active.product_id = Product.id
            AND pv_active.status = 'active'
            AND pv_active.deleted_at IS NULL
            AND pv_active.price > 0
        )`)
      ]
    };

    // Add category and brand filtering using many-to-many relationships
    if (categories) {
      const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        productWhereClause.id = {
          [Op.in]: Sequelize.literal(`(
            SELECT DISTINCT product_id 
            FROM product_categories 
            WHERE category_id IN (${categoryIds.join(',')})
          )`)
        };
      }
    }

    if (brand) {
      const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
      if (brandIds.length > 0) {
        if (categories) {
          const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
          if (categoryIds.length > 0) {
            // If both categories and brands are specified, use EXISTS logic to avoid subquery issues
            productWhereClause.id = {
              [Op.in]: Sequelize.literal(`(
                SELECT DISTINCT pc.product_id 
                FROM product_categories pc
                INNER JOIN product_brands pb ON pc.product_id = pb.product_id
                WHERE pc.category_id IN (${categoryIds.join(',')})
                AND pb.brand_id IN (${brandIds.join(',')})
              )`)
            };
          }
        } else {
          productWhereClause.id = {
            [Op.in]: Sequelize.literal(`(
              SELECT DISTINCT product_id 
              FROM product_brands 
              WHERE brand_id IN (${brandIds.join(',')})
            )`)
          };
        }
      }
  }

  // Build variant where clause
    const variantWhereClause = {
      ...(priceRange && {
        [Op.or]: [
          Sequelize.literal(`EXISTS (
            SELECT 1
            FROM (
              SELECT MIN(pv2.price) AS min_price
              FROM product_variants pv2
              WHERE 
                pv2.product_id = Product.id
                AND pv2.status = 'active'
                AND pv2.deleted_at IS NULL
                AND pv2.price IS NOT NULL
                AND pv2.price > 0
            ) AS min_price_table
            WHERE min_price BETWEEN ${priceRange.min} AND ${priceRange.max}
          )`)
        ]
      }),
      ...(variantFilters.id && { id: variantFilters.id }),
      // stock: { [Op.gt]: 0 },
      // stock_status: 'in_stock',
      status: 'active'
    };


    // Attribute term conditions - need to ensure products have ALL specified attributes
    let attributeTermConditions = [];
    if (variantFilters.attributes) {
      for (const [attributeId, termIds] of Object.entries(variantFilters.attributes)) {
        if (Array.isArray(termIds) && termIds.length > 0) {
          attributeTermConditions.push({
            attribute_id: parseInt(attributeId),
            term_id: { [Op.in]: termIds.map(Number) }
          });
        }
      }
    }

    // Add attribute filtering to ensure products have ALL specified attributes
    if (attributeTermConditions.length > 0) {
      // Create subquery conditions for each attribute to ensure ALL attributes are present
      const attributeSubqueries = attributeTermConditions.map(condition => {
        return Sequelize.literal(`EXISTS (
          SELECT 1 FROM product_attribute_terms pat
          WHERE pat.product_id = Product.id
          AND pat.attribute_id = ${condition.attribute_id}
          AND pat.term_id IN (${condition.term_id[Op.in].join(',')})
          AND pat.deleted_at IS NULL
        )`);
      });
      
      // Use AND to ensure all conditions are met
      productWhereClause[Op.and] = productWhereClause[Op.and] || [];
      productWhereClause[Op.and].push(...attributeSubqueries);
    }
    // Build include clause with optimized associations
    const includeClause = [
      {
        model: Category,
        as: 'Categories',
        attributes: ['id', 'name', 'slug'],
        through: { attributes: ['is_primary'] }
      },
      {
        model: Brand,
        as: 'Brands',
        attributes: ['id', 'name', 'slug'],
        through: { attributes: ['is_primary'] }
      },
      {
        model: ProductVariant,
        as: 'variants',
        where: variantWhereClause,
        required: Object.keys(variantWhereClause).length > 0,
        include: [
          {
            model: ProductVariantAttribute,
            as: 'variantAttributes',
            include: [
              {
                model: Attribute,
                as: 'attribute',
                attributes: ['id', 'name', 'type']
              },
              {
                model: AttributeTerm,
                as: 'term',
                attributes: ['id', 'name', 'slug']
              }
            ]
          },
          {
            model: ProductVariantImage,
            as: 'variantImages',
            attributes: ['id', 'variant_id', 'image_url', 'is_primary']
          }
        ]
      },
      {
        model: ProductAttributeTerm,
        as: 'productAttributeTerms',
        include: [
          {
            model: Attribute,
            as: 'attribute',
            attributes: ['id', 'name', 'type']
          },
          {
            model: AttributeTerm,
            as: 'term',
            attributes: ['id', 'name', 'slug']
          }
        ]
      },
      {
        model: ProductImage,
        as: 'ProductImages',
        attributes: ['id', 'product_id', 'image_url', 'is_primary']
      },
      {
        model: Deal,
        as: 'deals',
        through: { 
          model: DealProduct,
          attributes: []
        },
        where: {
          is_active: true,
          is_deleted: false,
          valid_from: { [Op.lte]: new Date() },
          valid_to: { [Op.gte]: new Date() },
          ...(deal_id && { id: parseInt(deal_id) })
        },
        required: deal_id ? true : false,
        attributes: [
          'id', 
          'name', 
          'slug', 
          'deal_type', 
          'required_qty', 
          'get_qty', 
          'fixed_price', 
          'discount_percent', 
          'tiered_qty_json',
          'valid_from',
          'valid_to'
        ]
      }
    ];
    // Handle popularity sorting (order_count) - always calculate for display
    const orderCountJoin = `
      LEFT JOIN (
        SELECT 
          oi.product_id,
          COUNT(DISTINCT o.id) AS order_count
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND o.status IN ('processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'completed')
        AND o.deletedAt IS NULL
        GROUP BY oi.product_id
      ) order_stats ON p.id = order_stats.product_id`;

    const minPriceJoin = `
      LEFT JOIN (
        SELECT 
          pv_min.product_id,
          MIN(pv_min.price) AS min_price
        FROM product_variants pv_min
        WHERE pv_min.status = 'active'
        AND pv_min.deleted_at IS NULL
        AND pv_min.price IS NOT NULL
        AND pv_min.price > 0
        GROUP BY pv_min.product_id
      ) price_stats ON p.id = price_stats.product_id`;

    // OPTIMIZATION: Convert to raw SQL and execute in parallel to reduce round trips
    const [totalCount, products] = await Promise.all([
      // 1. Get total count with raw SQL (includes variant filtering like original)
      sequelize.query(`
        SELECT COUNT(DISTINCT p.id) as count
        FROM products p
        WHERE p.deletedAt IS NULL
        AND p.status = :status
        ${keyword ? 'AND p.name LIKE :keyword' : ''}
        ${categories ? (() => {
          const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
          return categoryIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.join(',')}))` : '';
        })() : ''}
        ${brand ? (() => {
          const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
          return brandIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brandIds.join(',')}))` : '';
        })() : ''}
        ${priceRange ? `AND EXISTS (
          SELECT 1
          FROM (
            SELECT MIN(pv2.price) AS min_price
            FROM product_variants pv2
            WHERE 
              pv2.product_id = p.id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) AS min_price_table
          WHERE min_price BETWEEN :minPrice AND :maxPrice
        )` : ''}
        ${variantFilters.id ? 'AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)' : ''}
        ${Object.keys(selectedAttributes).length > 0 ? `
          ${Object.entries(selectedAttributes)
            .map(([attrId, termIds]) => 
              `AND EXISTS (
                SELECT 1
                FROM product_attribute_terms pat
                WHERE pat.product_id = p.id
                AND pat.attribute_id = ${parseInt(attrId)}
                AND pat.term_id IN (${termIds.join(',')})
                AND pat.deleted_at IS NULL
              )`
            )
            .join('')}
        ` : ''}
        ${deal_id ? `AND EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = :dealId AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())` : ''}
        AND EXISTS (
          SELECT 1 FROM product_variants pv_active
          WHERE pv_active.product_id = p.id
          AND pv_active.status = 'active'
          AND pv_active.deleted_at IS NULL
          AND pv_active.price IS NOT NULL
          AND pv_active.price > 0
        )
      `, {
        replacements: {
          status,
          ...(keyword && { keyword: `%${keyword}%` }),
          ...(priceRange && { minPrice: priceRange.min, maxPrice: priceRange.max }),
          ...(variantFilters.id && { variantId: variantFilters.id }),
          ...(deal_id && { dealId: parseInt(deal_id) })
        },
        type: sequelize.QueryTypes.SELECT
      }).then(result => result[0].count),

      // 2. Get products with raw SQL (simplified includes)
      sequelize.query(`
        SELECT DISTINCT
          p.id, p.updated_by, p.name, p.slug, p.sku, p.price, p.discount_price,
          p.stock_quantity, p.puff_count, p.is_new, p.battery_capacity,
          p.coil_style, p.device_style, p.eliquid_capacity, p.pod_coil_style,
          p.pod_fill_style, p.power_supply, p.nicotine_strength, p.nicotine_type,
          p.vg_ratio, p.vaping_style, p.bottle_size, p.status, p.is_discontinued, p.createdAt,
          p.updatedAt, p.deletedAt,
          COALESCE(order_stats.order_count, 0) as order_count,
          COALESCE(price_stats.min_price, 0) as min_price
        FROM products p
        ${orderCountJoin}
        ${minPriceJoin}
        WHERE p.deletedAt IS NULL
        AND p.status = :status
        ${keyword ? 'AND p.name LIKE :keyword' : ''}
        ${categories ? (() => {
          const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
          return categoryIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.join(',')}))` : '';
        })() : ''}
        ${brand ? (() => {
          const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
          return brandIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brandIds.join(',')}))` : '';
        })() : ''}
        ${priceRange ? `AND EXISTS (
          SELECT 1
          FROM (
            SELECT MIN(pv2.price) AS min_price
            FROM product_variants pv2
            WHERE 
              pv2.product_id = p.id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) AS min_price_table
          WHERE min_price BETWEEN :minPrice AND :maxPrice
        )` : ''}
        ${variantFilters.id ? 'AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)' : ''}
        ${Object.keys(selectedAttributes).length > 0 ? `
          ${Object.entries(selectedAttributes)
            .map(([attrId, termIds]) => 
              `AND EXISTS (
                SELECT 1
                FROM product_attribute_terms pat
                WHERE pat.product_id = p.id
                AND pat.attribute_id = ${parseInt(attrId)}
                AND pat.term_id IN (${termIds.join(',')})
                AND pat.deleted_at IS NULL
              )`
            )
            .join('')}
        ` : ''}
        ${deal_id ? `AND EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = :dealId AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())` : ''}
        AND EXISTS (
          SELECT 1 FROM product_variants pv_active
          WHERE pv_active.product_id = p.id
          AND pv_active.status = 'active'
          AND pv_active.deleted_at IS NULL
          AND pv_active.price IS NOT NULL
          AND pv_active.price > 0
        )
        ORDER BY ${
          sort_by === 'popularity' || sort_by === 'order_count' 
            ? `order_count ${orderValue}` 
            : sort_by === 'price' 
            ? `min_price ${orderValue}` 
            : `p.${({ id: 'id', name: 'name', price: 'price', createdAt: 'createdAt', created_at: 'createdAt', stock: 'stock_quantity' }[sort_by] || 'id')} ${orderValue}`
        }, p.id ASC
        LIMIT :limit OFFSET :offset
      `, {
        replacements: {
          status,
          ...(keyword && { keyword: `%${keyword}%` }),
          ...(priceRange && { minPrice: priceRange.min, maxPrice: priceRange.max }),
          ...(variantFilters.id && { variantId: variantFilters.id }),
          ...(deal_id && { dealId: parseInt(deal_id) }),
          limit: parsedLimit,
          offset: parsedOffset
        },
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / parsedLimit);
    const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

    // OPTIMIZATION: Fetch all related data in parallel to reduce round trips
    const productIds = products.map(p => p.id);
    
    const [
      productReviews,
      productCategories,
      productBrands,
      productVariants,
      productImages,
      productAttributeTerms,
      variantAttributes,
      variantImages,
      deals
    ] = await Promise.all([
      // 1. Fetch reviews
      productIds.length > 0 ? sequelize.query(`
        SELECT 
          r.id, r.product_id, r.user_id, r.order_id, r.user_name, r.company_name,
          r.rating, r.comment, r.verified_by, r.testimonial, r.created_at,
          u.first_name, u.last_name, u.profile_pic_url,
          o.order_unique_id
        FROM reviews r
        LEFT JOIN users u ON u.id = r.user_id
        LEFT JOIN orders o ON o.id = r.order_id
        WHERE r.product_id IN (:productIds)
        AND r.is_visible = true
        AND r.deleted_at IS NULL
        ORDER BY r.product_id, r.created_at DESC
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 2. Fetch categories
      productIds.length > 0 ? sequelize.query(`
        SELECT pc.product_id, c.id, c.name, c.slug, pc.is_primary
        FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id IN (:productIds)
        ORDER BY pc.product_id, c.${safeCategorySortBy} ${safeOrder}
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 3. Fetch brands
      productIds.length > 0 ? sequelize.query(`
        SELECT pb.product_id, b.id, b.name, b.slug, pb.is_primary
        FROM product_brands pb
        JOIN brands b ON b.id = pb.brand_id
        WHERE pb.product_id IN (:productIds)
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 4. Fetch variants with filters
      productIds.length > 0 ? sequelize.query(`
        SELECT 
          pv.id, pv.product_id, pv.slug,
          pv.regular_price, pv.price, pv.discount_price, pv.purchase_price,
          pv.weight, pv.length, pv.width, pv.height,
          pv.description, pv.barcode,
          pv.stock, pv.low_stock_threshold, pv.stock_status, pv.is_discontinued,
          pv.status, pv.updated_by, pv.created_at, pv.updated_at, pv.deleted_at
        FROM product_variants pv
        WHERE pv.product_id IN (:productIds)
        AND pv.status = 'active'
        AND pv.deleted_at IS NULL
        ${priceRange ? `AND EXISTS (
          SELECT 1
          FROM (
            SELECT MIN(pv2.price) AS min_price
            FROM product_variants pv2
            WHERE 
              pv2.product_id = pv.product_id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) AS min_price_table
          WHERE min_price BETWEEN ${priceRange.min} AND ${priceRange.max}
        )` : ''}
        ${variantFilters.id ? `AND pv.id = ${parseInt(variantFilters.id)}` : ''}
        ORDER BY pv.product_id, pv.${safeVariantSortBy} ${safeOrder}
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 5. Fetch product images
      productIds.length > 0 ? sequelize.query(`
        SELECT pi.id, pi.product_id, pi.image_url, pi.is_primary, pi.alt_text
        FROM product_images pi
        WHERE pi.product_id IN (:productIds)
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 6. Fetch product attribute terms
      productIds.length > 0 ? sequelize.query(`
        SELECT pat.id, pat.product_id, pat.attribute_id, pat.term_id, pat.used_in_variation, pat.is_visible_page,
               pat.updated_by, pat.created_at, pat.updated_at, pat.deleted_at,
               a.id as attr_id, a.name as attr_name, a.type as attr_type,
               t.id as term_id, t.name as term_name, t.slug as term_slug
        FROM product_attribute_terms pat
        JOIN attributes a ON a.id = pat.attribute_id
        JOIN attribute_terms t ON t.id = pat.term_id
        WHERE pat.product_id IN (:productIds)
        AND pat.deleted_at IS NULL
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 7. Fetch variant attributes
      productIds.length > 0 ? sequelize.query(`
        SELECT 
          pva.id, pva.variant_id, pva.attribute_id, pva.term_id,
          pva.is_visible, pva.used_in_variation,
          pva.updated_by, pva.created_at, pva.updated_at, pva.deleted_at,
               a.id as attr_id, a.name as attr_name, a.type as attr_type,
               t.id as term_id, t.name as term_name, t.slug as term_slug
        FROM product_variant_attributes pva
        JOIN attributes a ON a.id = pva.attribute_id
        JOIN attribute_terms t ON t.id = pva.term_id
        WHERE pva.variant_id IN (
          SELECT pv.id FROM product_variants pv 
          WHERE pv.product_id IN (:productIds)
        )
        ORDER BY pva.variant_id, a.name, t.name
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 8. Fetch variant images
      productIds.length > 0 ? sequelize.query(`
        SELECT pvi.id, pvi.variant_id, pvi.image_url, pvi.is_primary
        FROM product_variant_images pvi
        WHERE pvi.variant_id IN (
          SELECT pv.id FROM product_variants pv 
          WHERE pv.product_id IN (:productIds)
        )
        AND pvi.deleted_at IS NULL
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : [],

      // 9. Fetch deals (always fetch, filter by deal_id if specified)
      productIds.length > 0 ? sequelize.query(`
        SELECT dp.product_id, d.id, d.name, d.slug, d.deal_type, d.required_qty, 
               d.get_qty, d.fixed_price, d.discount_percent, d.tiered_qty_json,
               d.valid_from, d.valid_to
        FROM deal_products dp
        JOIN deals d ON d.id = dp.deal_id
        WHERE dp.product_id IN (:productIds)
        ${deal_id ? `AND d.id = ${parseInt(deal_id)}` : ''}
        AND d.is_active = true
        AND d.is_deleted = false
        AND d.valid_from <= NOW()
        AND d.valid_to >= NOW()
      `, { 
        replacements: { productIds },
        type: sequelize.QueryTypes.SELECT 
      }) : []
    ]);

    // OPTIMIZATION: Group all related data by product_id for efficient lookup
    const reviewsMap = new Map();
    const categoriesMap = new Map();
    const brandsMap = new Map();
    const variantsMap = new Map();
    const imagesMap = new Map();
    const attributeTermsMap = new Map();
    const variantAttributesMap = new Map();
    const variantImagesMap = new Map();
    const dealsMap = new Map();

    // Group reviews
    productReviews.forEach(review => {
      if (!reviewsMap.has(review.product_id)) reviewsMap.set(review.product_id, []);
      reviewsMap.get(review.product_id).push(review);
    });

    // Group categories
    productCategories.forEach(cat => {
      if (!categoriesMap.has(cat.product_id)) categoriesMap.set(cat.product_id, []);
      categoriesMap.get(cat.product_id).push({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        ProductCategory: { is_primary: Boolean(cat.is_primary) }
      });
    });

    // Group brands
    productBrands.forEach(brand => {
      if (!brandsMap.has(brand.product_id)) brandsMap.set(brand.product_id, []);
      brandsMap.get(brand.product_id).push({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        ProductBrand: { is_primary: Boolean(brand.is_primary) }
      });
    });

    // Group variants
    productVariants.forEach(variant => {
      if (!variantsMap.has(variant.product_id)) variantsMap.set(variant.product_id, []);
      variantsMap.get(variant.product_id).push(variant);
    });

    // Group images
    productImages.forEach(img => {
      if (!imagesMap.has(img.product_id)) imagesMap.set(img.product_id, []);
      imagesMap.get(img.product_id).push({
        id: img.id,
        product_id: img.product_id,
        image_url: img.image_url,
        is_primary: Boolean(img.is_primary),
        alt_text: img.alt_text
      });
    });

    // Group attribute terms
    productAttributeTerms.forEach(pat => {
      if (!attributeTermsMap.has(pat.product_id)) attributeTermsMap.set(pat.product_id, []);
      attributeTermsMap.get(pat.product_id).push({
        id: pat.id,
        product_id: pat.product_id,
        attribute_id: pat.attribute_id,
        term_id: pat.term_id,
        is_visible_page: Boolean(pat.is_visible_page),
        used_in_variation: Boolean(pat.used_in_variation),
        updated_by: pat.updated_by,
        created_at: pat.created_at,
        updated_at: pat.updated_at,
        deleted_at: pat.deleted_at,
        attribute: {
          id: pat.attr_id,
          name: pat.attr_name,
          type: pat.attr_type
        },
        term: {
          id: pat.term_id,
          name: pat.term_name,
          slug: pat.term_slug
        }
      });
    });

    // Group variant attributes
    variantAttributes.forEach(va => {
      if (!variantAttributesMap.has(va.variant_id)) variantAttributesMap.set(va.variant_id, []);
      variantAttributesMap.get(va.variant_id).push({
        id: va.id,
        variant_id: va.variant_id,
        attribute_id: va.attribute_id,
        term_id: va.term_id,
        is_visible: Boolean(va.is_visible),
        used_in_variation: Boolean(va.used_in_variation),
        updated_by: va.updated_by,
        created_at: va.created_at,
        updated_at: va.updated_at,
        deleted_at: va.deleted_at,
        attribute: {
          id: va.attr_id,
          name: va.attr_name,
          type: va.attr_type
        },
        term: {
          id: va.term_id,
          name: va.term_name,
          slug: va.term_slug
        }
      });
    });

    // Group variant images
    variantImages.forEach(vi => {
      if (!variantImagesMap.has(vi.variant_id)) variantImagesMap.set(vi.variant_id, []);
      variantImagesMap.get(vi.variant_id).push({
        id: vi.id,
        variant_id: vi.variant_id,
        image_url: vi.image_url,
        is_primary: Boolean(vi.is_primary)
      });
    });

    // Group deals
    deals.forEach(deal => {
      if (!dealsMap.has(deal.product_id)) dealsMap.set(deal.product_id, []);
      // Remove product_id field to match original response structure
      const { product_id, ...dealWithoutProductId } = deal;
      dealsMap.get(deal.product_id).push(dealWithoutProductId);
    });

    // OPTIMIZATION: Process products with pre-fetched related data
    const availableProducts = products.filter(product => {
      const productVariants = variantsMap.get(product.id) || [];
      const availableVariants = productVariants.filter(variant => 
        variant.status === 'active' && parseFloat(variant.price) > 0
      );
      if (availableVariants.length > 0) {
        const minPrice = Math.min(...availableVariants.map(variant => parseFloat(variant.price) || 0));
        const minPriceVariant = availableVariants.reduce((minV, v) => {
          const vPrice = parseFloat(v.price) || 0;
          return vPrice === minPrice ? v : minV;
        }, null);
        
        let minPriceVariantData = null;
        if (minPriceVariant) {
          const variantImages = variantImagesMap.get(minPriceVariant.id) || [];
          let variantImage = variantImages.length > 0 ? variantImages[0] : null;
          if (!variantImage) {
            const productImages = imagesMap.get(product.id) || [];
            variantImage = productImages.find(img => img.is_primary) || productImages[0];
          }
          minPriceVariantData = {
            id: minPriceVariant.id,
            slug: minPriceVariant.slug,
            price: minPriceVariant.price,
            variant_image: variantImage ? {
              id: variantImage.id,
              variant_id: variantImage.variant_id,
              image_url: variantImage.image_url,
              is_primary: Boolean(variantImage.is_primary)
            } : null
          };
        }
        product.price = minPrice;
        product.min_price_variant = minPriceVariantData;
        return true;
      }
      return false;
    }).map(product => {
      // Attach related data to product
      product.Categories = categoriesMap.get(product.id) || [];
      product.Brands = brandsMap.get(product.id) || [];
      // Preserve original variant field order and attach nested data
      const vList = variantsMap.get(product.id) || [];
      product.variants = vList.map(v => ({
        id: v.id,
        product_id: v.product_id,
        slug: v.slug,
        regular_price: v.regular_price,
        price: v.price,
        discount_price: v.discount_price,
        purchase_price: v.purchase_price,
        weight: v.weight,
        length: v.length,
        width: v.width,
        height: v.height,
        description: v.description,
        barcode: v.barcode,
        stock: v.stock,
        low_stock_threshold: v.low_stock_threshold,
        stock_status: v.stock_status,
        is_discontinued: Boolean(v.is_discontinued),
        status: v.status,
        updated_by: v.updated_by,
        created_at: v.created_at,
        updated_at: v.updated_at,
        deleted_at: v.deleted_at,
        variantAttributes: (variantAttributesMap.get(v.id) || []).map(va => ({
          id: va.id,
          variant_id: v.id,
          attribute_id: va.attribute_id,
          term_id: va.term_id,
          is_visible: Boolean(va.is_visible),
          used_in_variation: Boolean(va.used_in_variation),
          updated_by: va.updated_by,
          created_at: va.created_at,
          updated_at: va.updated_at,
          deleted_at: va.deleted_at,
          attribute: va.attribute,
          term: va.term
        })),
        variantImages: variantImagesMap.get(v.id) || []
      }));
      // product.ProductImages = imagesMap.get(product.id) || [];
      product.productAttributeTerms = attributeTermsMap.get(product.id) || [];
      product.ProductImages = imagesMap.get(product.id) || [];
      
      product.deals = dealsMap.get(product.id) || [];
      // Extract largest puff count from number-of-puffs attribute
      let puffCount = null;
      if (product.productAttributeTerms) {
        const puffAttributes = product.productAttributeTerms.filter(pat => {
          if (!pat.attribute || !pat.attribute.name) return false;
          // Case-insensitive regex match for "number of puffs" with flexible spacing
          return /number\s+of\s+puffs/i.test(pat.attribute.name);
        });
        
        if (puffAttributes.length > 0) {
          let maxPuffCount = 0;
          let maxPuffTerm = null;
          
          puffAttributes.forEach(pat => {
            if (pat.term) {
              // Find all numbers in the string
              const puffMatches = pat.term.name.match(/(\d+)/g);
              if (puffMatches) {
                // Use the largest number in the string
                const count = Math.max(...puffMatches.map(Number));
                if (count > maxPuffCount) {
                  maxPuffCount = count;
                  maxPuffTerm = pat.term.name;
                }
              }
            }
          });
          if (maxPuffCount > 0) {
            if (maxPuffTerm && maxPuffTerm.toLowerCase().includes('up to')) {
              puffCount = `~${maxPuffCount} puffs`;
            } else {
              puffCount = maxPuffTerm;
            }
          }
        }
      }

      // out_of_stock = stock only; is_discontinued stays a separate flag (FE / cart)
      const hasInStockVariant = product.variants && product.variants.some(variant =>
        variant.status === 'active' &&
        variant.stock > 0 &&
        (variant.stock_status === stockStatus.IN_STOCK || variant.stock_status === stockStatus.LOW_STOCK) &&
        variant.price !== null &&
        parseFloat(variant.price) > 0
      );

      // Add flavors and flavor_count to each product
      let flavorTerms = [];
      if (product.productAttributeTerms && product.productAttributeTerms.length > 0) {
        flavorTerms = product.productAttributeTerms
          .filter(pat => {
            // Case-insensitive check for flavour attribute
            // Check both the mapped attribute object (pat.attribute.name) 
            // AND the raw SQL column (pat.attr_name) as fallback
            const attrName = (pat.attribute && pat.attribute.name) || pat.attr_name;
            return attrName && 
                   attrName.toLowerCase().trim() === 'flavour' && 
                   pat.term && 
                   pat.term.id && 
                   pat.term.name;
          })
          .map(pat => ({
            id: pat.term.id,
            name: pat.term.name,
            slug: pat.term.slug
          }));
      }
      const flavor_count = flavorTerms.length;

      // Process reviews for this product
      const productReviewsData = reviewsMap.get(product.id) || [];
      
      // Process reviews efficiently - OPTIMIZED: Single pass processing
      const reviewsMapForProduct = new Map();
      let totalRating = 0;
      let verifiedCount = 0;
      let testimonialCount = 0;
      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      
      // Single pass: process reviews and calculate statistics simultaneously
      productReviewsData.forEach(review => {
        if (!reviewsMapForProduct.has(review.id)) {
          const processedReview = {
            id: review.id,
            user_id: review.user_id,
            order_id: review.order_id,
            user_name: review.user_name,
            company_name: review.company_name,
            rating: review.rating,
            comment: review.comment,
            verified_by: review.verified_by,
            testimonial: review.testimonial,
            created_at: review.created_at,
            user: review.user_id ? {
              id: review.user_id,
              first_name: review.first_name,
              last_name: review.last_name,
              profile_pic_url: review.profile_pic_url
            } : null,
            order: review.order_id ? {
              id: review.order_id,
              order_unique_id: review.order_unique_id
            } : null
          };
          
          reviewsMapForProduct.set(review.id, processedReview);
          
          // Calculate statistics in the same loop
          totalRating += review.rating;
          ratingDistribution[review.rating]++;
          if (review.verified_by) verifiedCount++;
          if (review.testimonial) testimonialCount++;
        }
      });
      
      const processedReviews = Array.from(reviewsMapForProduct.values());
      
      // Calculate review statistics - OPTIMIZED: Pre-calculated values
      const reviewStats = {
        total_reviews: processedReviews.length,
        average_rating: processedReviews.length > 0 ? Math.round((totalRating / processedReviews.length) * 10) / 10 : 0,
        rating_distribution: ratingDistribution,
        verified_reviews: verifiedCount,
        testimonials: testimonialCount
      };

      return {
        ...product,
        puff_count: puffCount,
        flavors: flavorTerms,
        flavor_count,
        out_of_stock: !hasInStockVariant,
        min_price_variant: product.min_price_variant || null,
        order_count: product.order_count ? parseInt(product.order_count) : 0,
        reviews: processedReviews,
        review_stats: reviewStats,
         is_new: is_new ? (() => {
           // Only calculate when is_new parameter is requested
           const thirtyDaysAgo = new Date();
           thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
           return new Date(product.createdAt) >= thirtyDaysAgo;
         })() : false
      };
    });
    // Build base product filter conditions for SQL queries
    let productFilterConditions = [];
    let productFilterParams = {};
    
    if (keyword) {
      productFilterConditions.push("p.name LIKE :keyword");
      productFilterParams.keyword = `%${keyword}%`;
    }
    
    // Note: is_new doesn't filter products in SQL - it only affects "New" tagging in the response
    // Sorting follows sort_by/order (defaults apply when omitted)
    
    // Add deal filter condition
    if (deal_id) {
      productFilterConditions.push("EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = :dealId AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())");
      productFilterParams.dealId = parseInt(deal_id);
    }
    
    // Price range filter for products
    if (priceRange) {
      productFilterConditions.push(`EXISTS (
        SELECT 1
        FROM (
          SELECT MIN(pv2.price) AS min_price
          FROM product_variants pv2
          WHERE 
            pv2.product_id = p.id
            AND pv2.status = 'active'
            AND pv2.deleted_at IS NULL
            AND pv2.price IS NOT NULL
            AND pv2.price > 0
        ) AS min_price_table
        WHERE min_price BETWEEN :minPrice AND :maxPrice
      )`);
      productFilterParams.minPrice = priceRange.min;
      productFilterParams.maxPrice = priceRange.max;
    }
    
    // Variant filter
    if (variantFilters.id) {
      productFilterConditions.push("EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)");
      productFilterParams.variantId = variantFilters.id;
    }
    
    // Attribute term conditions for SQL
    let sqlAttributeFilterConditions = [];
    if (variantFilters.attributes) {
      for (const [attributeId, termIds] of Object.entries(variantFilters.attributes)) {
        if (Array.isArray(termIds) && termIds.length > 0) {
          sqlAttributeFilterConditions.push(`(pat.attribute_id = ${parseInt(attributeId)} AND pat.term_id IN (${termIds.join(',')}))`);
        }
      }
    }
    
    // Combine all filter conditions
    const sqlProductWhereClause = productFilterConditions.length > 0 
      ? "WHERE " + productFilterConditions.join(" AND ") 
      : "";
    
    // Note: sqlAttributeWhereClause is no longer used as we now use AND logic for attribute filtering
    // const sqlAttributeWhereClause = sqlAttributeFilterConditions.length > 0 
    //   ? sqlAttributeFilterConditions.join(" OR ") 
    //   : "";
    // Prepare price range filter conditions for category and brand queries
    // const priceRangeFilterConditions = productFilterConditions.filter(condition => 
    //   !condition.includes('min_price BETWEEN :minPrice AND :maxPrice')
    // );
    const priceRangeFilterConditions = productFilterConditions;
    const priceRangeFilterParams = {...productFilterParams};
    
    // Add variant filter for price_ranges
    // let priceRangeVariantWhereClauseForPriceRange = "";
    // if (variantFilters.id) {
    //   priceRangeVariantWhereClauseForPriceRange = "AND pv.id = :variantId";
    //   priceRangeFilterParams.variantId = variantFilters.id;
    // }
    
    const priceRangeWhereClause = priceRangeFilterConditions.length > 0 
      ? "WHERE " + priceRangeFilterConditions.join(" AND ") 
      : "";
    // 1. Fetch categories with product counts - WITH category filter
    // For category_items: Filters by keyword, price_range, brand, variant, is_new, and deal_id
    // Updated: Use product_categories junction table
    const categoryResults = await sequelize.query(`
      WITH product_price_ranges AS (
        SELECT 
          p.id as product_id,
          (
            SELECT MIN(pv2.price)
            FROM product_variants pv2
            WHERE 
              pv2.product_id = p.id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${brand ? (() => {
            const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
            return brandIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brandIds.join(',')}))` : '';
          })() : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            ${Object.entries(selectedAttributes)
              .map(([attrId, termIds]) => 
                `AND EXISTS (
                  SELECT 1
                  FROM product_attribute_terms pat2
                  WHERE pat2.product_id = p.id
                  AND pat2.attribute_id = ${parseInt(attrId)}
                  AND pat2.term_id IN (${termIds.join(',')})
                )`
              )
              .join('')}
          ` : ''}
      )
      SELECT 
        c.id, 
        c.name, 
        c.slug, 
        COUNT(DISTINCT pc.product_id) as product_count
      FROM 
        categories c
      JOIN product_categories pc ON pc.category_id = c.id
      JOIN product_price_ranges ppr ON ppr.product_id = pc.product_id
      WHERE
        ppr.min_price IS NOT NULL
      GROUP BY 
        c.id, c.name, c.slug
    `, {
      replacements: priceRangeFilterParams,
      type: sequelize.QueryTypes.SELECT,
    });
//  ${variantFilters.id ? `AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)` : ''}
// ${deal_id ? `AND EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = ${parseInt(deal_id)} AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())` : ''}
    // 2. Fetch brands with product counts - WITH brand filter
    // For brand_items: Filters by keyword, price_range, category, variant, is_new, and deal_id
    // Updated: Use product_brands junction table
    const brandResults = await sequelize.query(`
      WITH product_price_ranges AS (
        SELECT 
          p.id as product_id,
          (
            SELECT MIN(pv2.price)
            FROM product_variants pv2
            WHERE 
              pv2.product_id = p.id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${categories ? (() => {
            const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
            return categoryIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.join(',')}))` : '';
          })() : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            ${Object.entries(selectedAttributes)
              .map(([attrId, termIds]) =>
                `AND EXISTS (
                  SELECT 1
                  FROM product_attribute_terms pat2
                  WHERE pat2.product_id = p.id
                  AND pat2.attribute_id = ${parseInt(attrId)}
                  AND pat2.term_id IN (${termIds.join(',')})
                )`
              )
              .join('')}
          ` : ''}
      )
      SELECT 
        b.id, 
        b.name, 
        b.slug, 
        COUNT(DISTINCT pb.product_id) as product_count
      FROM 
        brands b
      JOIN product_brands pb ON pb.brand_id = b.id
      JOIN product_price_ranges ppr ON ppr.product_id = pb.product_id
      WHERE
        ppr.min_price IS NOT NULL
      GROUP BY 
        b.id, b.name, b.slug
    `, {
      replacements: priceRangeFilterParams,
      type: sequelize.QueryTypes.SELECT
    });
//  ${variantFilters.id ? `AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)` : ''}
// ${deal_id ? `AND EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = ${parseInt(deal_id)} AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())` : ''}
    // 3. Fetch attributes and terms with product counts - WITH attribute filter
    const attributeFilterConditions = [...productFilterConditions];
    const attributeFilterParams = {...productFilterParams};
    
    // Add brand and category filtering for attributes
    if (brand) {
      const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
      if (brandIds.length > 0) {
        attributeFilterConditions.push("EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (:brandIds))");
        attributeFilterParams.brandIds = brandIds;
      }
    }
    
    if (categories) {
      const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        attributeFilterConditions.push("EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (:categoryIds))");
        attributeFilterParams.categoryIds = categoryIds;
      }
    }

    const attributeResults = await sequelize.query(`
      WITH filtered_products AS (
        SELECT DISTINCT p.id
        FROM products p
        LEFT JOIN product_attribute_terms pat ON p.id = pat.product_id
        WHERE p.deletedAt IS NULL
        AND p.status = 'published'
        ${priceRange ? `
          AND EXISTS (
            SELECT 1
            FROM (
              SELECT MIN(pv2.price) AS min_price
              FROM product_variants pv2
              WHERE 
                pv2.product_id = p.id
                AND pv2.status = 'active'
                AND pv2.deleted_at IS NULL
                AND pv2.price IS NOT NULL
                AND pv2.price > 0
            ) AS min_price_table
            WHERE min_price BETWEEN ${priceRange.min} AND ${priceRange.max}
          )
        ` : ''}
        ${attributeFilterConditions.length > 0 ? `AND ${attributeFilterConditions.join(" AND ")}` : ''}
        ${Object.keys(selectedAttributes).length > 0 ? `
          ${Object.entries(selectedAttributes)
            .map(([attrId, termIds]) => 
              `AND EXISTS (
                SELECT 1
                FROM product_attribute_terms pat2
                WHERE pat2.product_id = p.id
                AND pat2.attribute_id = ${parseInt(attrId)}
                AND pat2.term_id IN (${termIds.join(',')})
              )`
            )
            .join('')}
        ` : ''}
        ${deal_id ? `
          AND EXISTS (
            SELECT 1 
            FROM deal_products dp 
            JOIN deals d ON dp.deal_id = d.id 
            WHERE dp.product_id = p.id 
            AND d.id = ${parseInt(deal_id)} 
            AND d.is_active = true 
            AND d.is_deleted = false 
            AND d.valid_from <= NOW() 
            AND d.valid_to >= NOW()
          )
        ` : ''}
        AND EXISTS (
          SELECT 1 FROM product_variants pv_active
          WHERE pv_active.product_id = p.id
          AND pv_active.status = 'active'
          AND pv_active.deleted_at IS NULL
          AND pv_active.price IS NOT NULL
          AND pv_active.price > 0
        )
      )
      SELECT 
        a.id as attribute_id, 
        a.name as attribute_name, 
        a.type as attribute_type,
        a.slug as attribute_slug,
        pat.used_in_variation,
        pat.is_visible_page,
        t.id as term_id, 
        t.name as term_name, 
        t.slug as term_slug,
        COUNT(DISTINCT p.id) as product_count
      FROM 
        attributes a
      JOIN 
        (
          SELECT DISTINCT pat.attribute_id, pat.term_id, pat.used_in_variation, pat.is_visible_page
          FROM product_attribute_terms pat
        ) pat ON pat.attribute_id = a.id
      JOIN 
        attribute_terms t ON t.id = pat.term_id
      JOIN 
        filtered_products p ON p.id IN (
          SELECT product_id 
          FROM product_attribute_terms 
          WHERE attribute_id = a.id AND term_id = t.id
        )
      GROUP BY 
        a.id, a.name, a.type, a.slug, pat.used_in_variation, pat.is_visible_page, t.id, t.name, t.slug
      ORDER BY 
        a.id, t.name
    `, {
      replacements: attributeFilterParams,
      type: sequelize.QueryTypes.SELECT
    });

    // Process attribute results into the required format
    const attributeMap = new Map();
    const processedTerms = new Set(); // Track processed terms to avoid duplicates
    
    attributeResults.forEach(result => {
      if (!attributeMap.has(result.attribute_id)) {
        attributeMap.set(result.attribute_id, {
          attribute: {
            id: result.attribute_id,
            name: result.attribute_name,
            type: result.attribute_type,
            is_visible: !!result.is_visible_page,
            slug: result.attribute_slug
          },
          terms: []
        });
      }
      
      const attributeData = attributeMap.get(result.attribute_id);
      const termKey = `${result.attribute_id}-${result.term_id}`;
      
      // Only add the term if it hasn't been processed yet
      if (!processedTerms.has(termKey)) {
        processedTerms.add(termKey);
        attributeData.terms.push({
          id: result.term_id,
          name: result.term_name,
          slug: result.term_slug,
          product_count: result.product_count
        });
      }
    });

    // Format price ranges
    const priceRanges = [
      { label: "£0 - £9.99", min: 0, max: 9.99, value: "0-9.99" },
      { label: "£10 - £19.99", min: 10, max: 19.99, value: "10-19.99" },
      { label: "£20 - £29.99", min: 20, max: 29.99, value: "20-29.99" },
      { label: "£30 - £49.99", min: 30, max: 49.99, value: "30-49.99" },
      { label: "£50 - £99.99", min: 50, max: 99.99, value: "50-99.99" },
      { label: "£100 - £199.99", min: 100, max: 199.99, value: "100-199.99" },
      { label: "£200 & Above", min: 200, max: Infinity, value: "200+" }
    ];

    // 3. Fetch price ranges with product counts - WITH price range filter
    // For price_ranges: Filters by keyword, brand, categories, variant, is_new, and deal_id
    // Note: priceRangeFilterConditions, priceRangeFilterParams, and priceRangeWhereClause are already defined above
    
    const priceRangeResults = await sequelize.query(`
      WITH product_price_ranges AS (
        SELECT 
          p.id as product_id,
          (
            SELECT MIN(pv2.price)
            FROM product_variants pv2
            WHERE 
              pv2.product_id = p.id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${brand ? (() => {
            const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
            return brandIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brandIds.join(',')}))` : '';
          })() : ''}
          ${categories ? (() => {
            const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
            return categoryIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.join(',')}))` : '';
          })() : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            ${Object.entries(selectedAttributes)
              .map(([attrId, termIds]) => 
                `AND EXISTS (
                  SELECT 1
                  FROM product_attribute_terms pat2
                  WHERE pat2.product_id = p.id
                  AND pat2.attribute_id = ${parseInt(attrId)}
                  AND pat2.term_id IN (${termIds.join(',')})
                )`
              )
              .join('')}
          ` : ''}
      )
      SELECT 
        CASE 
          WHEN min_price < 10 THEN '0-9.99'
          WHEN min_price < 20 THEN '10-19.99'
          WHEN min_price < 30 THEN '20-29.99'
          WHEN min_price < 50 THEN '30-49.99'
          WHEN min_price < 100 THEN '50-99.99'
          WHEN min_price < 200 THEN '100-199.99'
          ELSE '200+'
        END as price_range,
        COUNT(*) as count
      FROM 
        product_price_ranges ppr
      WHERE
        min_price IS NOT NULL
      GROUP BY 
        CASE 
          WHEN min_price < 10 THEN '0-9.99'
          WHEN min_price < 20 THEN '10-19.99'
          WHEN min_price < 30 THEN '20-29.99'
          WHEN min_price < 50 THEN '30-49.99'
          WHEN min_price < 100 THEN '50-99.99'
          WHEN min_price < 200 THEN '100-199.99'
          ELSE '200+'
        END
    `, {
      replacements: priceRangeFilterParams,
      type: sequelize.QueryTypes.SELECT
    });

    const priceRangeCounts = priceRanges.map(range => {
      const result = priceRangeResults.find(r => r.price_range === range.value);
      return {
        label: range.label,
        count: result ? result.count : 0,
        value: range.value
      };
    });
    
    // 4. Fetch deals with product counts - WITH deal filter
    // For deal_items: Filters by keyword, brand, categories, variant, is_new, and price_range
    const dealResults = await sequelize.query(`
      WITH product_price_ranges AS (
        SELECT 
          p.id as product_id,
          (
            SELECT MIN(pv2.price)
            FROM product_variants pv2
            WHERE 
              pv2.product_id = p.id
              AND pv2.status = 'active'
              AND pv2.deleted_at IS NULL
              AND pv2.price IS NOT NULL
              AND pv2.price > 0
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${variantFilters.id ? `AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)` : ''}
          ${brand ? (() => {
            const brandIds = brand.split(',').map(Number).filter(id => !isNaN(id));
            return brandIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brandIds.join(',')}))` : '';
          })() : ''}
          ${categories ? (() => {
            const categoryIds = categories.split(',').map(Number).filter(id => !isNaN(id));
            return categoryIds.length > 0 ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.join(',')}))` : '';
          })() : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            ${Object.entries(selectedAttributes)
              .map(([attrId, termIds]) => 
                `AND EXISTS (
                  SELECT 1
                  FROM product_attribute_terms pat2
                  WHERE pat2.product_id = p.id
                  AND pat2.attribute_id = ${parseInt(attrId)}
                  AND pat2.term_id IN (${termIds.join(',')})
                )`
              )
              .join('')}
          ` : ''}
      )
      SELECT 
        d.id, 
        d.name, 
        d.slug, 
        d.deal_type,
        d.required_qty,
        d.get_qty,
        d.fixed_price,
        d.discount_percent,
        d.tiered_qty_json,
        d.valid_from,
        d.valid_to,
        d.image_url,
        COUNT(DISTINCT dp.product_id) as product_count
      FROM 
        deals d
      JOIN deal_products dp ON dp.deal_id = d.id
      JOIN product_price_ranges ppr ON ppr.product_id = dp.product_id
      WHERE
        d.is_active = true 
        AND d.is_deleted = false 
        AND d.valid_from <= NOW() 
        AND d.valid_to >= NOW()
        AND ppr.min_price IS NOT NULL
        ${deal_id ? `AND d.id = ${parseInt(deal_id)}` : ''}
      GROUP BY 
        d.id, d.name, d.slug, d.deal_type, d.required_qty, d.get_qty, d.fixed_price, d.discount_percent, d.tiered_qty_json, d.valid_from, d.valid_to
      ORDER BY 
        d.name
    `, {
      replacements: priceRangeFilterParams,
      type: sequelize.QueryTypes.SELECT
    });
    // ${variantFilters.id ? `AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)` : ''}
    // ${deal_id ? `AND EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = ${parseInt(deal_id)} AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())` : ''}
    // let deals_text = ""
    // if(dealResults.length>0){
    //   deals_text = `Get the most for your money with our amazing ${dealResults[0].required_qty} for £${dealResults[0].fixed_price} deal and ${dealResults[1].required_qty} for £${dealResults[1].fixed_price} offer on ${products[0].Categories[0].name} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They’re not our only multibuy deals, we have plenty more!`
    // }
    
    // Prepare additional data based on source
    const additionalData = {};
    if (source === "category" && availableProducts[0]?.Categories && availableProducts[0].Categories.length > 0) {
      const primaryCategory = availableProducts[0].Categories.find(cat => cat.ProductCategory?.is_primary) || availableProducts[0].Categories[0];
      Object.assign(additionalData, {
        id: primaryCategory.id,
        name: primaryCategory.name,
        slug: primaryCategory.slug
      });
    } else if (source === "brand" && availableProducts[0]?.Brands && availableProducts[0].Brands.length > 0) {
      const primaryBrand = availableProducts[0].Brands.find(brand => brand.ProductBrand?.is_primary) || availableProducts[0].Brands[0];
      Object.assign(additionalData, {
        id: primaryBrand.id,
        name: primaryBrand.name,
        slug: primaryBrand.slug
      });
    } else if (source === "deal" && dealResults && dealResults.length > 0) {
      const deal = dealResults[0];
      Object.assign(additionalData, {
        id: deal.id,
        name: deal.name,
        slug: deal.slug,
        deal_type: deal.deal_type,
        required_qty: deal.required_qty,
        get_qty: deal.get_qty,
        fixed_price: deal.fixed_price,
        discount_percent: deal.discount_percent,
        tiered_qty_json: deal.tiered_qty_json,
        valid_from: deal.valid_from,
        valid_to: deal.valid_to
      });
    }
    return {
      additionalData,
      products: availableProducts,
      category_items: categoryResults,
      brand_items: brandResults,
      deal_items: dealResults,
      // deals_text: deals_text,
      attributes: Array.from(attributeMap.values()),
      price_ranges: priceRangeCounts,
      pagination: {
        total_count: totalCount,
        total_pages: totalPages,
        current_page: currentPage,
        limit: parsedLimit,
        offset: parsedOffset
      }
    };
  } catch (error) {
    console.error('Error in fetchProducts:', error);
    throw error;
  }
};

// Helper to get the minimum price variant for a product
function getMinPriceVariant(product) {
  if (!product || !product.variants || product.variants.length === 0) return null;
  // Filter variants to exclude out-of-stock variants
  const availableVariants = product.variants.filter(variant => 
    variant.status === 'active' && 
    !variant.is_discontinued &&
    parseFloat(variant.price) > 0 
    // && variant.stock_status !== 'out_of_stock' && 
    // (variant.stock === null || variant.stock > 0)
  );
  // If no variants are in stock, return null to avoid showing the product
  if (availableVariants.length === 0) return null;
  const minPrice = Math.min(...availableVariants.map(variant => parseFloat(variant.price) || 0));
  const minPriceVariant = availableVariants.reduce((minV, v) => {
    const vPrice = parseFloat(v.price) || 0;
    return vPrice === minPrice ? v : minV;
  }, null);
  let variantImage = (minPriceVariant.variantImages && minPriceVariant.variantImages.length > 0)
    ? minPriceVariant.variantImages[0]
    : null;
  if (!variantImage && product.ProductImages && product.ProductImages.length > 0) {
    variantImage = product.ProductImages.find(img => img.is_primary) || product.ProductImages[0];
  }
  return {
    id: minPriceVariant.id,
    slug: minPriceVariant.slug,
    price: minPriceVariant.price,
    regular_price: minPriceVariant.regular_price,
    discount_price: minPriceVariant.discount_price,
    variant_image: variantImage || null
  };
}

// Cached wrapper for product listing (reduces DB load; invalidate with invalidateCachePattern('products:*') on admin product changes)
const fetchProductsCached = async (query, status = 'published') => {
  const cacheKey = `products:list:${JSON.stringify({
    sort_by: query.sort_by,
    order: query.order,
    limit: query.limit,
    offset: query.offset,
    keyword: query.keyword,
    price_range: query.price_range,
    categories: query.categories,
    brand: query.brand,
    variant: query.variant,
    is_new: query.is_new,
    source: query.source,
    deal_id: query.deal_id,
    status
  })}`;
  return cacheOrFetch(cacheKey, () => fetchProducts(query, status), 30);
};

/**
 * Hide selector when there is exactly 1 active variant and none of that
 * variant's attributes are both used for variations and page-visible
 * (same filters as PDP available_terms / picker).
 * Product-level attributes not linked to the variant are ignored.
 * Display-only attrs (used_in_variation = false) do not keep the selector open.
 *
 * @param {Array} activeVariants - variants with variantAttributes / attributes
 * @param {Array} productAttributeTerms - ALL product_attribute_terms for the product
 */
function shouldHideVariantSelector(activeVariants = [], productAttributeTerms = []) {
  if (!Array.isArray(activeVariants) || activeVariants.length !== 1) {
    return false;
  }

  const variant = activeVariants[0];
  const variantAttrs =
    variant.variantAttributes ||
    variant.attributes ||
    [];

  if (variantAttrs.length === 0) return true;

  // Picker-relevant: used_in_variation + is_visible_page
  const pickerVisibleByAttrTerm = new Map();
  for (const pat of productAttributeTerms) {
    const attrId = pat.attribute_id ?? pat.attr_id;
    const termId = pat.term_id;
    if (attrId == null || termId == null) continue;
    const usedInVariation = pat.used_in_variation === true || pat.used_in_variation === 1;
    const isVisiblePage = pat.is_visible_page === true || pat.is_visible_page === 1;
    pickerVisibleByAttrTerm.set(`${attrId}-${termId}`, usedInVariation && isVisiblePage);
  }

  const hasPickerVisibleVariantAttr = variantAttrs.some((va) => {
    const attrId = va.attribute?.id ?? va.attribute_id;
    const termId = va.term?.id ?? va.term_id;
    return pickerVisibleByAttrTerm.get(`${attrId}-${termId}`) === true;
  });

  return !hasPickerVisibleVariantAttr;
}

module.exports = { getTrendingProducts, generateUniqueFileName, fetchProducts: fetchProductsCached, fetchProductsOriginal: fetchProducts, getMinPriceVariant, invalidateCachePattern, shouldHideVariantSelector };

