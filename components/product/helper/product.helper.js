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
      variant,
      is_new,
      source
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
    console.log("productWhereClause>>>",productWhereClause)
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
console.log("variantWhereClause>>>>",variantWhereClause )
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
// console.log("products>>>>>", products)
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

    // Get all attributes and their terms
    const allAttributes = await Attribute.findAll({
      include: [{
        model: AttributeTerm,
        as: 'terms'
      }]
    });

    // Create a common attributes structure
    const commonAttributes = new Map();
    
    // Process all attributes and their terms
    allAttributes.forEach(attribute => {
      if (!commonAttributes.has(attribute.id)) {
        commonAttributes.set(attribute.id, {
          attribute: {
            id: attribute.id,
            name: attribute.name,
            type: attribute.type,
            is_visible_page: attribute.is_visible_page
          },
          terms: []
        });
      }

      // Add only terms that have products in the current filter results
      attribute.terms.forEach(term => {
        const termCount = termCountMap.get(`${attribute.id}-${term.id}`) || 0;
        if (termCount > 0) { // Only add terms with product_count > 0
          commonAttributes.get(attribute.id).terms.push({
            id: term.id,
            name: term.name,
            slug: term.slug,
            product_count: termCount
          });
        }
      });

      // Remove attributes that have no terms with products
      if (commonAttributes.get(attribute.id).terms.length === 0) {
        commonAttributes.delete(attribute.id);
      }
    });

    // Convert Map to array and sort attributes by ID
    const sortedAttributes = Array.from(commonAttributes.values())
      .sort((a, b) => a.attribute.id - b.attribute.id);

    // Define price ranges
    const priceRanges = [
      { label: "Under £10", min: 0, max: 10, value: "0-10" },
      { label: "£10 - £25", min: 10, max: 25, value: "10-25" },
      { label: "£25 - £50", min: 25, max: 50, value: "25-50" },
      { label: "£50 - £100", min: 50, max: 100, value: "50-100" },
      { label: "£100 - £200", min: 100, max: 200, value: "100-200" },
      { label: "£200 & Above", min: 200, max: Infinity, value: "200+" }
    ];

    // Function to calculate price range counts
    const calculatePriceRanges = (products) => {
      return priceRanges.map(range => {
        const count = products.filter(product => 
          product.price >= range.min && product.price < range.max
        ).length;
        return {
          label: range.label,
          count,
          value: range.value
        };
      });
    };

    // Calculate price range counts
    const priceRangeCounts = calculatePriceRanges(products);

    // Calculate rating distribution
    const ratingDistribution = [
      { label: "4★ & above", value: 4, count: products.filter(p => p.rating >= 4).length },
      { label: "3★ & above", value: 3, count: products.filter(p => p.rating >= 3).length },
      { label: "2★ & above", value: 2, count: products.filter(p => p.rating >= 2).length },
      { label: "1★ & above", value: 1, count: products.filter(p => p.rating >= 1).length }
    ];

    // Calculate discount distribution
    const discountDistribution = [
      { label: "50% or more", value: 50, count: products.filter(p => p.discount_percentage >= 50).length },
      { label: "40% or more", value: 40, count: products.filter(p => p.discount_percentage >= 40).length },
      { label: "30% or more", value: 30, count: products.filter(p => p.discount_percentage >= 30).length },
      { label: "20% or more", value: 20, count: products.filter(p => p.discount_percentage >= 20).length },
      { label: "10% or more", value: 10, count: products.filter(p => p.discount_percentage >= 10).length }
    ];

    // Calculate availability counts
    const availabilityCounts = {
      in_stock: products.filter(p => p.stock_quantity > 0).length,
      out_of_stock: products.filter(p => p.stock_quantity === 0).length
    };

    // Fetch additional data based on source
    let additionalData = {};
    
    if (source === 'category' && categories) {
      // Get all products for pricing calculation
      const allProducts = await Product.findAll({
        attributes: ['price', 'brand_id'],
        include: [{
          model: Brand,
          as: 'Brand',
          attributes: ['id', 'name', 'slug']
        }]
      });

      // Calculate price ranges from all products
      const priceRanges = calculatePriceRanges(allProducts);

      // Get brands filtered by price range if specified
      let filteredBrands = [];
      if (price_range) {
        const [minPrice, maxPrice] = price_range.split('-').map(Number);
        const brandsInPriceRange = new Map();

        allProducts.forEach(product => {
          if (!product.Brand) return;
          
          const price = product.price;
          if (price !== null && 
              price >= minPrice && 
              (maxPrice === undefined || price < maxPrice)) {
            
            const brandId = product.Brand.id;
            if (!brandsInPriceRange.has(brandId)) {
              brandsInPriceRange.set(brandId, {
                id: product.Brand.id,
                name: product.Brand.name,
                slug: product.Brand.slug,
                product_count: 0
              });
            }
            brandsInPriceRange.get(brandId).product_count++;
          }
        });

        filteredBrands = Array.from(brandsInPriceRange.values());
      } else {
        // If no price range selected, get all unique brands with their total product counts
        const brandProductCounts = new Map();
        
        allProducts.forEach(product => {
          if (!product.Brand) return;
          
          const brandId = product.Brand.id;
          if (!brandProductCounts.has(brandId)) {
            brandProductCounts.set(brandId, {
              id: product.Brand.id,
              name: product.Brand.name,
              slug: product.Brand.slug,
              product_count: 0
            });
          }
          brandProductCounts.get(brandId).product_count++;
        });

        filteredBrands = Array.from(brandProductCounts.values());
      }

      additionalData = {
        price_ranges: priceRanges,
        brands: filteredBrands
      };
    } 
    else if (source === 'brand' && brands) {
      // Get all products for pricing calculation
      const allProducts = await Product.findAll({
        attributes: ['price', 'category_id'],
        include: [{
          model: Category,
          as: 'Category',
          attributes: ['id', 'name', 'slug']
        }]
      });

      // Calculate price ranges from all products
      const priceRanges = calculatePriceRanges(allProducts);

      // Get categories based on price range
      let filteredCategories = [];
      if (price_range) {
        const [minPrice, maxPrice] = price_range.split('-').map(Number);
        const categoriesInPriceRange = new Map();

        allProducts.forEach(product => {
          if (!product.Category) return;
          
          const price = product.price;
          if (price !== null && 
              price >= minPrice && 
              (maxPrice === undefined || price < maxPrice)) {
            
            const categoryId = product.Category.id;
            if (!categoriesInPriceRange.has(categoryId)) {
              categoriesInPriceRange.set(categoryId, {
                id: product.Category.id,
                name: product.Category.name,
                slug: product.Category.slug,
                product_count: 0
              });
            }
            categoriesInPriceRange.get(categoryId).product_count++;
          }
        });

        // Only include categories that have products in the selected price range
        filteredCategories = Array.from(categoriesInPriceRange.values())
          .filter(category => category.product_count > 0);
      } else {
        // If no price range selected, get all unique categories with their total product counts
        const categoryProductCounts = new Map();
        
        allProducts.forEach(product => {
          if (!product.Category) return;
          
          const categoryId = product.Category.id;
          if (!categoryProductCounts.has(categoryId)) {
            categoryProductCounts.set(categoryId, {
              id: product.Category.id,
              name: product.Category.name,
              slug: product.Category.slug,
              product_count: 0
            });
          }
          categoryProductCounts.get(categoryId).product_count++;
        });

        // Only include categories that have products
        filteredCategories = Array.from(categoryProductCounts.values())
          .filter(category => category.product_count > 0);
      }

      additionalData = {
        price_ranges: priceRanges,
        categories: filteredCategories
      };
    } 
    else if (source === 'product') {
      // Get all products for pricing calculation
      const allProducts = await Product.findAll({
        attributes: ['price', 'category_id', 'brand_id'],
        include: [
          {
            model: Category,
            as: 'Category',
            attributes: ['id', 'name', 'slug']
          },
          {
            model: Brand,
            as: 'Brand',
            attributes: ['id', 'name', 'slug']
          }
        ]
      });

      // Calculate price ranges from all products
      const priceRanges = calculatePriceRanges(allProducts);

      // Get categories and brands based on price range
      let filteredCategories = [];
      let filteredBrands = [];

      if (price_range) {
        const [minPrice, maxPrice] = price_range.split('-').map(Number);
        const categoriesInPriceRange = new Map();
        const brandsInPriceRange = new Map();

        allProducts.forEach(product => {
          if (!product.Category || !product.Brand) return;
          
          const price = product.price;
          if (price !== null && 
              price >= minPrice && 
              (maxPrice === undefined || price < maxPrice)) {
            
            // Process category
            const categoryId = product.Category.id;
            if (!categoriesInPriceRange.has(categoryId)) {
              categoriesInPriceRange.set(categoryId, {
                id: product.Category.id,
                name: product.Category.name,
                slug: product.Category.slug,
                product_count: 0
              });
            }
            categoriesInPriceRange.get(categoryId).product_count++;

            // Process brand
            const brandId = product.Brand.id;
            if (!brandsInPriceRange.has(brandId)) {
              brandsInPriceRange.set(brandId, {
                id: product.Brand.id,
                name: product.Brand.name,
                slug: product.Brand.slug,
                product_count: 0
              });
            }
            brandsInPriceRange.get(brandId).product_count++;
          }
        });

        // Only include categories and brands that have products in the selected price range
        filteredCategories = Array.from(categoriesInPriceRange.values())
          .filter(category => category.product_count > 0);
        filteredBrands = Array.from(brandsInPriceRange.values())
          .filter(brand => brand.product_count > 0);
      } else {
        // If no price range selected, get all unique categories and brands with their total product counts
        const categoryProductCounts = new Map();
        const brandProductCounts = new Map();
        
        allProducts.forEach(product => {
          if (!product.Category || !product.Brand) return;
          
          // Process category
          const categoryId = product.Category.id;
          if (!categoryProductCounts.has(categoryId)) {
            categoryProductCounts.set(categoryId, {
              id: product.Category.id,
              name: product.Category.name,
              slug: product.Category.slug,
              product_count: 0
            });
          }
          categoryProductCounts.get(categoryId).product_count++;

          // Process brand
          const brandId = product.Brand.id;
          if (!brandProductCounts.has(brandId)) {
            brandProductCounts.set(brandId, {
              id: product.Brand.id,
              name: product.Brand.name,
              slug: product.Brand.slug,
              product_count: 0
            });
          }
          brandProductCounts.get(brandId).product_count++;
        });

        // Only include categories and brands that have products
        filteredCategories = Array.from(categoryProductCounts.values())
          .filter(category => category.product_count > 0);
        filteredBrands = Array.from(brandProductCounts.values())
          .filter(brand => brand.product_count > 0);
      }

      additionalData = {
        price_ranges: priceRanges,
        categories: filteredCategories,
        brands: filteredBrands
      };
    }
console.log("additional daat>>>", additionalData)
    return { 
      products,
      attributes: sortedAttributes,
      pagination,
      // filters: {
      //   price_ranges: priceRangeCounts,
      //   ratings: ratingDistribution,
      //   discounts: discountDistribution,
      //   availability: availabilityCounts
      // },
      ...additionalData
    };
  } catch (error) {
    console.log((error))
    console.error('Error fetching products:', error);
    throw error;
  }
};

module.exports = { getTrendingProducts, generateUniqueFileName, fetchProducts };