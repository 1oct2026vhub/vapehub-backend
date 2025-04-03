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
      brands,
      variant, // Expected format: { "12": [56,6,3,5], "29": [33,669,55] }
      is_new
    } = query;
    // Parse limit and offset as integers
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);

    // Handle variant parameter
    let variantObject = variant;
    if (typeof variant === 'string') {
      try {
        variantObject = JSON.parse(variant);
      } catch (error) {
        throw new Error('Invalid variant format: must be valid JSON');
      }
    }
    if (variantObject && typeof variantObject !== 'object') {
      throw new Error('Variant parameter must be an object');
    }

    // Build Product where clause
    let productWhereClause = {};
    if (keyword) {
      productWhereClause.name = { [Op.like]: `%${keyword}%` };
    }
    if (is_new) {
      const lastMonthDate = new Date();
      lastMonthDate.setDate(lastMonthDate.getDate() - 30);
      productWhereClause.createdAt = { [Op.gte]: lastMonthDate };
    }
    if (brands) {
      productWhereClause.brand_id = { [Op.in]: brands.split(',').map(Number) };
    }
    if (categories) {
      productWhereClause.category_id = { [Op.in]: categories.split(',').map(Number) };
    }

    // Build ProductVariant where clause
    let variantWhereClause = {};
    if (price_range) {
      const [minPrice, maxPrice] = price_range.split('-').map(Number);
      variantWhereClause.price = { [Op.between]: [minPrice || 0, maxPrice || Infinity] };
    }

    // Build ProductAttributeTerm where clause for variant filtering
    let productAttributeConditions = [];
    if (variantObject && Object.keys(variantObject).length > 0) {
      for (const [variantIdOrAttributeId, termIds] of Object.entries(variantObject)) {
        // Convert termIds to an array if it's a string
        let termIdsArray = termIds;
        if (typeof termIds === 'string') {
          try {
            termIdsArray = JSON.parse(termIds); // Parse string like "[905,66]" into array
          } catch (error) {
            throw new Error(`Invalid termIds format for ${variantIdOrAttributeId}: must be a valid JSON array`);
          }
        }
        // Ensure termIdsArray is an array and has elements
        if (Array.isArray(termIdsArray) && termIdsArray.length > 0) {
          const numericId = parseInt(variantIdOrAttributeId);
          const numericTermIds = termIdsArray.map(Number);

          if (variantIdOrAttributeId.length <= 2) { // Attribute ID
            productAttributeConditions.push({
              attribute_id: numericId,
              term_id: { [Op.in]: numericTermIds }
            });
          } else { // Variant ID
            variantWhereClause.id = numericId;
            productAttributeConditions.push({
              term_id: { [Op.in]: numericTermIds }
            });
          }
        } else {
          console.log(`🚀 ~ fetchProducts ~ Skipping ${variantIdOrAttributeId}: termIds is not a valid array`);
        }
      }
    }

    // Combine product attribute conditions
    let productAttributeWhereClause = {};
    if (productAttributeConditions.length > 0) {
      productAttributeWhereClause[Op.or] = productAttributeConditions; // Use OR to allow multiple attribute filters
    }

    // Build include clause
    const includeClause = [
      { model: Category, as: 'Category' },
      { model: Brand, as: 'Brand' },
      {
        model: ProductVariant,
        as: 'variants',
        where: variantWhereClause,
        required: Object.keys(variantWhereClause).length > 0, // Only require if variant ID is specified
        include: [
          {
            model: ProductVariantAttribute,
            as: 'variantAttributes',
            include: [
              { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
              { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
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
        where: productAttributeWhereClause,
        required: productAttributeConditions.length > 0, // Require if filtering by attributes
        include: [
          { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
          { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
        ]
      },
      { model: ProductImage, as: 'ProductImages' }
    ];

    // Get total count
    const totalCount = await Product.count({
      where: productWhereClause,
      include: includeClause,
      distinct: true
    });

    // Calculate pagination
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / parsedLimit) : 1;
    const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

    const pagination = {
      total_count: totalCount,
      total_pages: totalPages,
      current_page: currentPage,
      limit: parsedLimit,
      offset: parsedOffset
    };
    // Fetch products
    const products = await Product.findAll({
      where: productWhereClause,
      include: includeClause,
      order: [
        [sort_by, order],
        [{ model: ProductVariant, as: 'variants' }, sort_by, order]
      ],
      limit: parsedLimit,
      offset: parsedOffset,
      distinct: true,
    });

    // First, get all products to count terms across all products
    const allProducts = await Product.findAll({
      where: productWhereClause,
      include: [{
        model: ProductAttributeTerm,
        as: 'productAttributeTerms',
        include: [
          { model: Attribute, as: 'attribute' },
          { model: AttributeTerm, as: 'term' }
        ]
      }]
    });

    // Create a map to store term counts
    const termCountMap = new Map();

    // Count occurrences of each term across all products
    allProducts.forEach(product => {
      if (product.productAttributeTerms) {
        product.productAttributeTerms.forEach(pat => {
          const attributeId = pat.attribute.id;
          const termId = pat.term.id;
          const key = `${attributeId}-${termId}`;
          
          if (!termCountMap.has(key)) {
            termCountMap.set(key, 0);
          }
          termCountMap.set(key, termCountMap.get(key) + 1);
        });
      }
    });

    // Create a common attributes structure
    const commonAttributes = new Map();
    
    // Process all products to build common attributes
    products.forEach(product => {
      if (product.productAttributeTerms) {
        product.productAttributeTerms.forEach((pat) => {
          const attribute = pat.attribute;
          if (!attribute) return;

          if (!commonAttributes.has(attribute.id)) {
            commonAttributes.set(attribute.id, {
              attribute: {
                id: attribute.id,
                name: attribute.name,
                type: attribute.type,
                is_visible_page: pat.is_visible_page
              },
              terms: []
            });
          }

          // Check if term already exists to avoid duplicates
          const existingAttribute = commonAttributes.get(attribute.id);
          const termExists = existingAttribute.terms.some(term => term.id === pat.term.id);
          
          if (!termExists) {
            // Get the count for this term
            const termCount = termCountMap.get(`${attribute.id}-${pat.term.id}`) || 0;
            
            existingAttribute.terms.push({
              id: pat.term.id,
              name: pat.term.name,
              slug: pat.term.slug,
              product_count: termCount
            });
          }
        });
      }
    });

    // Convert Map to array and sort attributes by ID
    const sortedAttributes = Array.from(commonAttributes.values())
      .sort((a, b) => a.attribute.id - b.attribute.id);

    return { 
      products,
      attributes: sortedAttributes,
      pagination 
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

module.exports = { getTrendingProducts, generateUniqueFileName, fetchProducts };