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
    if (brand) {
      productWhereClause.brand_id = { [Op.in]: brand.split(',').map(Number) };
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

      { model: Category, as: 'Category'},   // , attributes: ['id', 'name'] 
      { model: Brand, as: 'Brand' },//, attributes: ['id', 'name'] 
      {
        model: ProductVariant,
        as: 'variants',
        where: variantWhereClause,
        required: Object.keys(variantWhereClause). length > 0, // Only require if variant ID is specified
        // attributes: ['id', 'slug'],
        include: [
          {
            model: ProductVariantAttribute,
            as: 'variantAttributes',
            // where: productAttributeWhereClause,
            //attributes: ['id', 'variant_id', 'attribute_id'],
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
        //attributes: ['id', 'product_id', 'attribute_id' ],
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

    const allAttributeTerms = await Product.findAll({
      where: productWhereClause,
      include: [{
        model: ProductAttributeTerm,
        as: 'productAttributeTerms',
        // where: productAttributeWhereClause,
        required: productAttributeConditions.length > 0,
        include: [
          { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
          { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
        ]
      }],
      limit: parsedLimit,
      offset: parsedOffset,
      distinct: true
    });

    
    const attributeTermMap = new Map();
    const allAttributeTermMap = new Map();
    const categoriesMap = new Map();
    const brandMap = new Map();

    // Process products data
    products.forEach((product, index) => {
      if(source == "brand"){
        if(product.category_id && product.Category){
          if(!categoriesMap.get(product.category_id)){
            categoriesMap.set(product.category_id, {
              id: product.Category.id,
              name: product.Category.name,
              slug: product.Category.slug,
              product_count: 1
            })
          }
          else{
            categoriesMap.get(product.category_id).product_count = categoriesMap.get(product.category_id).product_count + 1
          }
        }
      }
      else if(source == "category"){
        if(product.brand_id && product.Brand){
          if(!brandMap.get(product.brand_id)){
            brandMap.set(product.brand_id, {
              id: product.Brand.id,
              name: product.Brand.name,
              slug: product.Brand.slug,
              product_count: 1
            })
          }
          else{
            brandMap.get(product.brand_id).product_count = brandMap.get(product.brand_id).product_count + 1
          }
        }
      }
      else{
        if(product.category_id && product.Category){
          if(!categoriesMap.get(product.category_id)){
            categoriesMap.set(product.category_id, {
              id: product.Category.id,
              name: product.Category.name,
              slug: product.Category.slug,
              product_count: 1
            })
          }
          else{
            categoriesMap.get(product.category_id).product_count = categoriesMap.get(product.category_id).product_count + 1
          }
        }

        if(product.brand_id && product.Brand){
          if(!brandMap.get(product.brand_id)){
            brandMap.set(product.brand_id, {
              id: product.Brand.id,
              name: product.Brand.name,
              slug: product.Brand.slug,
              product_count: 1
            })
          }
          else{
            brandMap.get(product.brand_id).product_count = brandMap.get(product.brand_id).product_count + 1
          }
        }
      }

      // Process ProductAttributeTerm data
      if (product.productAttributeTerms) {
        product.productAttributeTerms.forEach((pat) => {
          if (!attributeTermMap.has(pat.attribute_id)) {
            attributeTermMap.set(pat.attribute_id, {
              attribute: {
                id: pat.attribute.id,
                name: pat.attribute.name,
                type: pat.attribute.type,
                is_visible: pat.is_visible_page,
              },
              terms: []
            });
          }
          const existingAttribute = attributeTermMap.get(pat.attribute_id);
          const termExists = existingAttribute.terms.findIndex(term => term.id === pat.term.id);
          if (termExists === -1) {
            existingAttribute.terms.push({
              id: pat.term.id,
              name: pat.term.name,
              slug: pat.term.slug,
              product_count: 1
            });
          } else {
            existingAttribute.terms[termExists].product_count = existingAttribute.terms[termExists].product_count + 1;
          }
        });
      }
    });

    // Process allAttributeTerms data
    if (allAttributeTerms) {
      allAttributeTerms.forEach((product) => {
        if (product.productAttributeTerms) {
          product.productAttributeTerms.forEach((pat) => {
            if (!allAttributeTermMap.has(pat.attribute_id)) {
              allAttributeTermMap.set(pat.attribute_id, {
                attribute: {
                  id: pat.attribute.id,
                  name: pat.attribute.name,
                  type: pat.attribute.type,
                  is_visible: pat.is_visible_page,
                  is_visible_page: pat.is_visible_page
                },
                terms: []
              });
            }
            const existingAttribute = allAttributeTermMap.get(pat.attribute_id);
            const termExists = existingAttribute.terms.findIndex(term => term.id === pat.term.id);
            
            if (termExists === -1) {
              existingAttribute.terms.push({
                id: pat.term.id,
                name: pat.term.name,
                slug: pat.term.slug,
                product_count: 1
              });
            } else {
              existingAttribute.terms[termExists].product_count = existingAttribute.terms[termExists].product_count + 1;
            }
          });
        }
      });
    }

    const attributes = Array.from(attributeTermMap.values());
    const allAttributes = Array.from(allAttributeTermMap.values());
    const category_items = Array.from(categoriesMap.values());
    const brand_items = Array.from(brandMap.values());

    // Compare and update product_count in attributeTermMap based on allAttributeTermMap
    allAttributeTermMap.forEach((allAttributeData, attributeId) => {
        if (attributeTermMap.has(attributeId)) {
            const attributeData = attributeTermMap.get(attributeId);
            allAttributeData.terms.forEach(allTerm => {
                const matchingTerm = attributeData.terms.find(term => term.id === allTerm.id);
                if (matchingTerm) {
                    matchingTerm.product_count = allTerm.product_count;
                } else {
                    // Add the unmatched term with product_count 0
                    attributeData.terms.push({
                        id: allTerm.id,
                        name: allTerm.name,
                        slug: allTerm.slug,
                        product_count: 0
                    });
                }
            });
        } else {
            // If attribute doesn't exist in attributeTermMap, add it with all terms having product_count 0
            attributeTermMap.set(attributeId, {
                attribute: allAttributeData.attribute,
                terms: allAttributeData.terms.map(term => ({
                    id: term.id,
                    name: term.name,
                    slug: term.slug,
                    product_count: 0
                }))
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

    // Calculate price range counts
    const priceRangeCounts = priceRanges.map(range => {
      const count = products.reduce((total, product) => {
        if (product.variants) {
          return total + product.variants.filter(variant => {
            const price = variant.price || 0;
            return price >= range.min && price < range.max;
          }).length;
        }
        return total;
      }, 0);

      return {
        label: range.label,
        count,
        value: range.value
      };
    });
    let additionalData = {}
    if(source == "category"){
      additionalData.id = products[0].Category.id
      additionalData.name = products[0].Category.name
      additionalData.slug = products[0].Category.slug
    }
    if(source == "brand"){
      additionalData.id = products[0].Brand.id
      additionalData.name = products[0].Brand.name
      additionalData.slug = products[0].Brand.slug
    }

    return { 
      additionalData,
      products,
      category_items,
      brand_items,
      attributes,
      // allAttributes,
      price_ranges: priceRangeCounts,
      pagination,
    };
  } catch (error) {
    console.log((error))
    console.error('Error fetching products:', error);
    throw error;
  }
};

module.exports = { getTrendingProducts, generateUniqueFileName, fetchProducts };