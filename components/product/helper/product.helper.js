const crypto = require('crypto');
const { sequelize, Product, Category, Brand, Flavor, ProductImage, ProductFlavor, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Order, Deal, DealProduct, ProductCategory, ProductBrand } = require("../../../models");
const { Sequelize, Op } = require("sequelize");

async function getTrendingProducts(limit = 10) {
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const trendingProducts = await sequelize.query(`
      SELECT 
        p.id, 
        p.name, 
        p.slug, 
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
        AND o.status NOT IN ('cancelled', 'refunded')
      GROUP BY 
        p.id, p.name, p.slug, p.price, p.discount_price
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
      sort_by = 'id',
      order = 'ASC',
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
    // Parse limit and offset as integers
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
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
        console.log('Product helper - using attributes parameter:', attributesData);
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
      ...(is_new && {
        createdAt: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 30))
        }
      }),
      status: status
    };

    // Add category and brand filtering using many-to-many relationships
    if (categories) {
      const categoryIds = categories.split(',').map(Number);
      productWhereClause.id = {
        [Op.in]: Sequelize.literal(`(
          SELECT DISTINCT product_id 
          FROM product_categories 
          WHERE category_id IN (${categoryIds.join(',')})
        )`)
      };
    }

    if (brand) {
      const brandIds = brand.split(',').map(Number);
      if (categories) {
        // If both categories and brands are specified, use EXISTS logic to avoid subquery issues
        productWhereClause.id = {
          [Op.in]: Sequelize.literal(`(
            SELECT DISTINCT pc.product_id 
            FROM product_categories pc
            INNER JOIN product_brands pb ON pc.product_id = pb.product_id
            WHERE pc.category_id IN (${categories.split(',').map(Number).join(',')})
            AND pb.brand_id IN (${brandIds.join(',')})
          )`)
        };
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


    // Create a separate variant where clause without the price range filter
    let priceRangeVariantWhereClause = "";
    if (variantFilters.id) {
      priceRangeVariantWhereClause = "AND pv.id = :variantId";
      priceRangeFilterParams.variantId = variantFilters.id;
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


    // Attribute term conditions
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
        where: attributeTermConditions.length > 0 ? { [Op.and]: attributeTermConditions } : {},
        required: attributeTermConditions.length > 0,
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

    // Get total count with filters
    const totalCount = await Product.count({
      where: productWhereClause,
      include: includeClause,
      distinct: true
    });

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / parsedLimit);
    const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;
    
    // Define attributes to select for Product, excluding 'description'
    const productAttributes = [
      'id', 'updated_by', 'name', 'slug', 'price', 'discount_price', 
      'stock_quantity', 'puff_count', 'is_new', 'battery_capacity', 
      'coil_style', 'device_style', 'eliquid_capacity', 'pod_coil_style', 
      'pod_fill_style', 'power_supply', 'nicotine_strength', 'nicotine_type', 
      'vg_ratio', 'vaping_style', 'bottle_size', 'status', 'createdAt', 
      'updatedAt', 'deletedAt'
    ];
    
    // Fetch products with filters
    const products = await Product.findAll({
      where: productWhereClause,
      attributes: productAttributes, // Exclude description
      include: includeClause,
      order: [
        [sort_by, order],
        [{ model: ProductVariant, as: 'variants' }, sort_by, order]
      ],
      limit: parsedLimit,
      offset: parsedOffset,
      distinct: true
    });
    // Filter out products with no available variants and set prices
    const availableProducts = products.filter(product => {
      if (product.variants && product.variants.length > 0) {
        const availableVariants = product.variants.filter(variant => 
          variant.status === 'active' && parseFloat(variant.price) > 0
        );
        
        if (availableVariants.length > 0) {
          const minPrice = Math.min(...availableVariants.map(variant => parseFloat(variant.price) || 0));
          const minPriceVariant = availableVariants.reduce((minV, v) => {
            const vPrice = parseFloat(v.price) || 0;
            return vPrice === minPrice ? v : minV;
          }, null);
          // Only include id, slug, price, and first variant image
          let minPriceVariantData = null;
          if (minPriceVariant) {
            let variantImage = (minPriceVariant.variantImages && minPriceVariant.variantImages.length > 0)
              ? minPriceVariant.variantImages[0]
              : null;
            if (!variantImage && product.ProductImages && product.ProductImages.length > 0) {
              variantImage = product.ProductImages.find(img => img.is_primary) || product.ProductImages[0];
            }
            minPriceVariantData = {
              id: minPriceVariant.id,
              slug: minPriceVariant.slug,
              price: minPriceVariant.price,
              variant_image: variantImage || null
            };
          }
          product.price = minPrice;
          product.min_price_variant = minPriceVariantData;
          return true;
        }
      }
      return false;
    }).map(product => {
      // Extract largest puff count from number-of-puffs attribute
      let puffCount = null;
      if (product.productAttributeTerms) {
        const puffAttributes = product.productAttributeTerms.filter(pat => 
          pat.attribute && pat.attribute.name === 'number-of-puffs'
        );
        
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

      // Add flavors and flavor_count to each product
      let flavorTerms = [];
      if (product.productAttributeTerms) {
        flavorTerms = product.productAttributeTerms
          .filter(pat => pat.attribute && pat.attribute.name === 'flavour' && pat.term)
          .map(pat => ({
            id: pat.term.id,
            name: pat.term.name,
            slug: pat.term.slug
          }));
      }
      const flavor_count = flavorTerms.length;
      return {
        ...product.toJSON(),
        puff_count: puffCount,
        flavors: flavorTerms,
        flavor_count,
        min_price_variant: product.min_price_variant || null
      };
    });

    // Build base product filter conditions for SQL queries
    let productFilterConditions = [];
    let productFilterParams = {};
    
    if (keyword) {
      productFilterConditions.push("p.name LIKE :keyword");
      productFilterParams.keyword = `%${keyword}%`;
    }
    
    if (is_new) {
      const lastMonthDate = new Date();
      lastMonthDate.setDate(lastMonthDate.getDate() - 30);
      productFilterConditions.push("p.createdAt >= :lastMonthDate");
      productFilterParams.lastMonthDate = lastMonthDate;
    }
    
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
    
    const sqlAttributeWhereClause = sqlAttributeFilterConditions.length > 0 
      ? sqlAttributeFilterConditions.join(" OR ") 
      : "";
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
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${brand ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brand.split(',').map(Number).join(',')}))` : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            AND EXISTS (
              SELECT 1
              FROM product_attribute_terms pat2
              WHERE pat2.product_id = p.id
              AND (
                ${Object.entries(selectedAttributes)
                  .map(([attrId, termIds]) => 
                    `(pat2.attribute_id = ${parseInt(attrId)} AND pat2.term_id IN (${termIds.join(',')}))`
                  )
                  .join(' OR ')}
              )
            )
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
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${categories ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categories.split(',').map(Number).join(',')}))` : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            AND EXISTS (
              SELECT 1
              FROM product_attribute_terms pat2
              WHERE pat2.product_id = p.id
              AND (
                ${Object.entries(selectedAttributes)
                  .map(([attrId, termIds]) => 
                    `(pat2.attribute_id = ${parseInt(attrId)} AND pat2.term_id IN (${termIds.join(',')}))`
                  )
                  .join(' OR ')}
              )
            )
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
      attributeFilterConditions.push("EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (:brandIds))");
      attributeFilterParams.brandIds = brand.split(',').map(Number);
    }
    
    if (categories) {
      attributeFilterConditions.push("EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (:categoryIds))");
      attributeFilterParams.categoryIds = categories.split(',').map(Number);
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
            ) AS min_price_table
            WHERE min_price BETWEEN ${priceRange.min} AND ${priceRange.max}
          )
        ` : ''}
        ${attributeFilterConditions.length > 0 ? `AND ${attributeFilterConditions.join(" AND ")}` : ''}
        ${Object.keys(selectedAttributes).length > 0 ? `
          AND EXISTS (
            SELECT 1
            FROM product_attribute_terms pat2
            WHERE pat2.product_id = p.id
            AND (
              ${Object.entries(selectedAttributes)
                .map(([attrId, termIds]) => 
                  `(pat2.attribute_id = ${parseInt(attrId)} AND pat2.term_id IN (${termIds.join(',')}))`
                )
                .join(' OR ')}
            )
          )
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
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${brand ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brand.split(',').map(Number).join(',')}))` : ''}
          ${categories ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categories.split(',').map(Number).join(',')}))` : ''}
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
      ${sqlAttributeWhereClause ? `
      JOIN product_attribute_terms pat ON pat.product_id = ppr.product_id
      ` : ''}
      WHERE
        min_price IS NOT NULL
        ${sqlAttributeWhereClause ? `AND (${sqlAttributeWhereClause})` : ''}
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
          ) as min_price
        FROM 
          products p
        WHERE
          p.deletedAt IS NULL
          AND p.status = 'published'
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${variantFilters.id ? `AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)` : ''}
          ${brand ? `AND EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brand.split(',').map(Number).join(',')}))` : ''}
          ${categories ? `AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categories.split(',').map(Number).join(',')}))` : ''}
          ${Object.keys(selectedAttributes).length > 0 ? `
            AND EXISTS (
              SELECT 1
              FROM product_attribute_terms pat2
              WHERE pat2.product_id = p.id
              AND (
                ${Object.entries(selectedAttributes)
                  .map(([attrId, termIds]) => 
                    `(pat2.attribute_id = ${parseInt(attrId)} AND pat2.term_id IN (${termIds.join(',')}))`
                  )
                  .join(' OR ')}
              )
            )
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
  const availableVariants = product.variants.filter(variant => variant.status === 'active' && parseFloat(variant.price) > 0);
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

module.exports = { getTrendingProducts, generateUniqueFileName, fetchProducts, getMinPriceVariant };