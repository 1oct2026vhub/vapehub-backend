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
      const [minPrice, maxPrice] = price_range.split('-').map(Number);
      if (isNaN(minPrice) || isNaN(maxPrice)) {
        throw new Error('Invalid price range format. Use format: min-max');
      }
      priceRange = { min: minPrice, max: maxPrice };
    }

    // Parse variant filter
    let variantFilters = {};
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

    // Build variant where clause
    const variantWhereClause = {
      ...(priceRange && {
        price: {
          [Op.between]: [priceRange.min, priceRange.max]
        }
      }),
      ...(variantFilters.id && { id: variantFilters.id })
    };

    // Build attribute term conditions
    const attributeTermConditions = [];
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
          variant.status === 'active' && 
          variant.stock > 0
        );
        
        if (availableVariants.length > 0) {
          const minPrice = Math.min(...availableVariants.map(variant => parseFloat(variant.price) || 0));
          product.price = minPrice;
          return true;
        }
      }
      return false;
    });

    // Process filters data
    const categoriesMap = new Map();
    const brandMap = new Map();
    const attributeTermMap = new Map();

    availableProducts.forEach(product => {
      // Process categories
      if (product.Category) {
        const categoryData = categoriesMap.get(product.category_id) || {
          id: product.Category.id,
          name: product.Category.name,
          slug: product.Category.slug,
          product_count: 0
        };
        categoryData.product_count++;
        categoriesMap.set(product.category_id, categoryData);
      }

      // Process brands
      if (product.Brand) {
        const brandData = brandMap.get(product.brand_id) || {
          id: product.Brand.id,
          name: product.Brand.name,
          slug: product.Brand.slug,
          product_count: 0
        };
        brandData.product_count++;
        brandMap.set(product.brand_id, brandData);
      }

      // Process attributes and terms
      if (product.productAttributeTerms) {
        product.productAttributeTerms.forEach(pat => {
          if (!attributeTermMap.has(pat.attribute_id)) {
            attributeTermMap.set(pat.attribute_id, {
              attribute: {
                id: pat.attribute.id,
                name: pat.attribute.name,
                type: pat.attribute.type,
                is_visible: pat.is_visible_page
              },
              terms: []
            });
          }

          const attributeData = attributeTermMap.get(pat.attribute_id);
          const termIndex = attributeData.terms.findIndex(t => t.id === pat.term.id);

          if (termIndex === -1) {
            attributeData.terms.push({
              id: pat.term.id,
              name: pat.term.name,
              slug: pat.term.slug,
              product_count: 1
            });
          } else {
            attributeData.terms[termIndex].product_count++;
          }
        });
      }
    });

    // Define price ranges
    const priceRanges = [
      { label: "£0 - £10", min: 0, max: 10, value: "0-10" },
      { label: "£10 - £25", min: 10, max: 25, value: "10-25" },
      { label: "£25 - £50", min: 25, max: 50, value: "25-50" },
      { label: "£50 - £75", min: 50, max: 75, value: "50-75" },
      { label: "£75 - £100", min: 75, max: 100, value: "75-100" },
      { label: "£100 - £200", min: 100, max: 200, value: "100-200" },
      { label: "£200 & Above", min: 200, max: Infinity, value: "200+" }
    ];

    // Calculate price range counts using available products
    const priceRangeCounts = priceRanges.map(range => {
      const count = availableProducts.reduce((total, product) => {
        const hasVariantInRange = product.variants?.some(variant => {
          const price = parseFloat(variant.price) || 0;
          return price >= range.min && price < range.max;
        });
        return total + (hasVariantInRange ? 1 : 0);
      }, 0);

      return {
        label: range.label,
        count,
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
      category_items: Array.from(categoriesMap.values()),
      brand_items: Array.from(brandMap.values()),
      attributes: Array.from(attributeTermMap.values()),
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