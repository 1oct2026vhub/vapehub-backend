const crypto = require('crypto');
const { sequelize, Product, Category, Brand, Flavor, ProductImage, ProductFlavor, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Order } = require("../../../models");;
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
        COUNT(o.id) AS order_count
      FROM 
        orders o
      JOIN 
        products p ON o.product_id = p.id
      WHERE 
        o.createdAt BETWEEN :startOfMonth AND :endOfMonth
      GROUP BY 
        p.id
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
      whereClause.brand_id = { [Op.in]: brandIds };
    }
    if (categories) {
      const categoryIds = categories.split(',').map(Number);
      whereClause.category_id = { [Op.in]: categoryIds };
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
      { model: Category, as: 'Category' },
      { model: Brand, as: 'Brand' },
      { model: ProductImage, as: 'ProductImages' },
      {
        model: Flavor, as: 'Flavors', through: {
          model: ProductFlavor,
        }
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

const fetchProducts = async (query) => {
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
      source
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
      ...(categories && {
        category_id: {
          [Op.in]: categories.split(',').map(Number)
        }
      }),
      ...(brand && {
        brand_id: {
          [Op.in]: brand.split(',').map(Number)
        }
      })
    };

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
        as: 'Category',
        attributes: ['id', 'name', 'slug']
      },
      {
        model: Brand,
        as: 'Brand',
        attributes: ['id', 'name', 'slug']
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
        where: attributeTermConditions.length > 0 ? { [Op.or]: attributeTermConditions } : {},
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

    // Fetch products with filters
    const products = await Product.findAll({
      where: productWhereClause,
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
          variant.status === 'active'
        );
        
        if (availableVariants.length > 0) {
          const minPrice = Math.min(...availableVariants.map(variant => parseFloat(variant.price) || 0));
          product.price = minPrice;
          return true;
        }
      }
      return false;
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

    // 1. Fetch categories with product counts - WITH category filter
    // For category_items: Filters by keyword, price_range, brand, variant, and is_new
    const categoryFilterConditions = [...productFilterConditions];
    const categoryFilterParams = {...productFilterParams};
    
    // Add brand filter for category_items
    if (brand) {
      const brandIds = brand.split(',').map(Number);
      categoryFilterConditions.push("p.brand_id IN (:brandIds)");
      categoryFilterParams.brandIds = brandIds;
    }
    
    const categoryWhereClause = categoryFilterConditions.length > 0 
      ? "WHERE " + categoryFilterConditions.join(" AND ") 
      : "";
    
    const categoryResults = await sequelize.query(`
      WITH product_price_ranges AS (
        SELECT 
          p.id as product_id,
          p.category_id,
          p.brand_id,
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
          ${priceRange ? `AND EXISTS (
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
          )` : ''}
          ${brand ? `AND p.brand_id IN (${brand})` : ''}
      )
      SELECT 
        c.id, 
        c.name, 
        c.slug, 
        COUNT(DISTINCT p.product_id) as product_count
      FROM 
        categories c
      JOIN 
        product_price_ranges p ON p.category_id = c.id
      ${sqlAttributeWhereClause ? `
      JOIN product_attribute_terms pat ON pat.product_id = p.product_id
      ` : ''}
      WHERE
        p.min_price IS NOT NULL
        ${sqlAttributeWhereClause ? `AND (${sqlAttributeWhereClause})` : ''}
      GROUP BY 
        c.id, c.name, c.slug
    `, {
      replacements: categoryFilterParams,
      type: sequelize.QueryTypes.SELECT
    });

    // 2. Fetch brands with product counts - WITH brand filter
    // For brand_items: Filters by keyword, price_range, categories, variant, and is_new
    const brandFilterConditions = [...productFilterConditions];
    const brandFilterParams = {...productFilterParams};
    
    // Add categories filter for brand_items
    if (categories) {
      const categoryIds = categories.split(',').map(Number);
      brandFilterConditions.push("p.category_id IN (:categoryIds)");
      brandFilterParams.categoryIds = categoryIds;
    }
    
    const brandWhereClause = brandFilterConditions.length > 0 
      ? "WHERE " + brandFilterConditions.join(" AND ") 
      : "";
    
    const brandResults = await sequelize.query(`
      WITH product_price_ranges AS (
        SELECT 
          p.id as product_id,
          p.brand_id,
          p.category_id,
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
          ${priceRange ? `AND EXISTS (
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
          )` : ''}
          ${categories ? `AND p.category_id IN (${categories})` : ''}
      )
      SELECT 
        b.id, 
        b.name, 
        b.slug, 
        COUNT(DISTINCT p.product_id) as product_count
      FROM 
        brands b
      JOIN 
        product_price_ranges p ON p.brand_id = b.id
      ${sqlAttributeWhereClause ? `
      JOIN product_attribute_terms pat ON pat.product_id = p.product_id
      ` : ''}
      WHERE
        p.min_price IS NOT NULL
        ${sqlAttributeWhereClause ? `AND (${sqlAttributeWhereClause})` : ''}
      GROUP BY 
        b.id, b.name, b.slug
    `, {
      replacements: brandFilterParams,
      type: sequelize.QueryTypes.SELECT
    });

    // 3. Fetch attributes and terms with product counts - WITH attribute filter
    const attributeFilterConditions = [...productFilterConditions];
    const attributeFilterParams = {...productFilterParams};
    
    // Add brand filter for attributes
    if (brand) {
      const brandIds = brand.split(',').map(Number);
      attributeFilterConditions.push("p.brand_id IN (:brandIds)");
      attributeFilterParams.brandIds = brandIds;
    }
    
    // Add categories filter for attributes
    if (categories) {
      const categoryIds = categories.split(',').map(Number);
      attributeFilterConditions.push("p.category_id IN (:categoryIds)");
      attributeFilterParams.categoryIds = categoryIds;
    }

    const attributeResults = await sequelize.query(`
      WITH filtered_products AS (
        SELECT DISTINCT p.id
        FROM products p
        LEFT JOIN product_attribute_terms pat ON p.id = pat.product_id
        WHERE p.deletedAt IS NULL
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
    // For price_ranges: Filters by keyword, brand, categories, variant, and is_new
    const priceRangeFilterConditions = productFilterConditions.filter(condition => 
      !condition.includes('min_price BETWEEN :minPrice AND :maxPrice')
    );
    const priceRangeFilterParams = {...productFilterParams};
    
    // Add brand filter for price_ranges
    if (brand) {
      const brandIds = brand.split(',').map(Number);
      priceRangeFilterConditions.push("p.brand_id IN (:brandIds)");
      priceRangeFilterParams.brandIds = brandIds;
    }
    
    // Add categories filter for price_ranges
    if (categories) {
      const categoryIds = categories.split(',').map(Number);
      priceRangeFilterConditions.push("p.category_id IN (:categoryIds)");
      priceRangeFilterParams.categoryIds = categoryIds;
    }
    
    // Add variant filter for price_ranges
    let priceRangeVariantWhereClauseForPriceRange = "";
    if (variantFilters.id) {
      priceRangeVariantWhereClauseForPriceRange = "AND pv.id = :variantId";
      priceRangeFilterParams.variantId = variantFilters.id;
    }
    
    const priceRangeWhereClause = priceRangeFilterConditions.length > 0 
      ? "WHERE " + priceRangeFilterConditions.join(" AND ") 
      : "";
    
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
          ${priceRangeWhereClause ? `AND ${priceRangeWhereClause.replace('WHERE ', '')}` : ''}
          ${variantFilters.id ? `AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)` : ''}
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

    // Prepare additional data based on source
    const additionalData = {};
    if (source === "category" && availableProducts[0]?.Category) {
      Object.assign(additionalData, {
        id: availableProducts[0].Category.id,
        name: availableProducts[0].Category.name,
        slug: availableProducts[0].Category.slug
      });
    } else if (source === "brand" && availableProducts[0]?.Brand) {
      Object.assign(additionalData, {
        id: availableProducts[0].Brand.id,
        name: availableProducts[0].Brand.name,
        slug: availableProducts[0].Brand.slug
      });
    }

    return {
      additionalData,
      products: availableProducts,
      category_items: categoryResults,
      brand_items: brandResults,
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

module.exports = { getTrendingProducts, generateUniqueFileName, fetchProducts };