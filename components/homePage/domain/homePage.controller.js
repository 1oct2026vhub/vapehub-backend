const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Carousel, BannerImage, SlugRelation, FooterSection, FooterLink, FlashNews, User, Deal, Product, Category, Brand, BlogCategory, DealProduct, SeoMeta, ProductCategory, ProductBrand, ProductVariant, ProductImage, WelcomeContent, FeatureContent, FeatureContentIcon, ShopByCategory, PopularCategory, EntityBanner, Redirect, CategoryBuyingGuide, BrandBuyingGuide } = require("../../../models");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');
const seoService = require("../../../components/admin/seo/domain/seo.service");
const axios = require('axios');
const { getAccessToken, findBusinessUnitId } = require('../../review/helper/review.helper');
const logger = require("../../../library/logger");
const { cacheOrFetch } = require('../../../library/cache');
// Priority order for entity types when multiple matches are found
const ENTITY_TYPE_PRIORITY = {
  category: 1,
  brand: 2,
  product: 3,
  product_variant: 4,
  blog: 5
};

const getEntityType = (type) => {
  if (type === 'blog') return 'blog_post';
  if (type === 'blog_category') return 'blog_category';
  if (type === 'product_variant') return 'product';
  if (type === 'deal') return 'deals';
  return type;
};

/**
 * Get deals for a specific entity (category or brand)
 * @param {string} entityType - The type of entity (category or brand)
 * @param {number} entityId - The ID of the entity
 * @returns {Object} Object containing deals array and deals text
 */
const getDealsForEntity = async (entityType, entityId) => {
    return cacheOrFetch(`deals:entity:${entityType}:${entityId}`, async () => {
    // Build deal filter
    const dealFilter = {
        is_active: true,
        is_deleted: false,
        valid_from: { [Op.lte]: new Date() },
        valid_to: { [Op.gte]: new Date() },
        show_home_page: true
    };

    let deals = [];
    let categoryName = 'products';

    if (entityType === 'category') {
        // Step 1: Get category details
        const category = await Category.findByPk(entityId);
        if (!category) {
            return { deals: [], deals_text: '' };
        }
        categoryName = category.name;

        // Step 2: Get product IDs from ProductCategory using category ID
        const productCategories = await ProductCategory.findAll({
            where: { category_id: entityId },
            attributes: ['product_id']
        });

        if (productCategories.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const productIds = productCategories.map(pc => pc.product_id);

        // Step 3: Get deal IDs from DealProduct using product IDs with stock check
        const dealProducts = await DealProduct.findAll({
            where: { product_id: { [Op.in]: productIds } },
            attributes: ['deal_id', 'product_id'],
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: { status: 'published' },
                    attributes: ['id', 'name', 'slug'],
                    include: [
                        {
                            model: ProductVariant,
                            as: 'variants',
                            attributes: ['id', 'stock', 'stock_status'],
                            where: { 
                                stock: { [Op.gt]: 0 },
                                deleted_at: null
                            },
                            required: false
                        }
                    ]
                }
            ]
        });

        if (dealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        // Filter deals to only include those where all products have available variants
        const availableDealProducts = dealProducts.filter(dp => {
            const product = dp.product;
            // Check if product has at least one variant with stock > 0
            return product.variants && product.variants.length > 0;
        });

        if (availableDealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const dealIds = [...new Set(availableDealProducts.map(dp => dp.deal_id))];

        // Step 4: Get deal data from Deal using deal IDs
        deals = await Deal.findAll({
            where: {
                id: { [Op.in]: dealIds },
                ...dealFilter
            },
            attributes: [
                'id', 
                'name', 
                'slug',
                'description',
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt'
            ]
        });

        // Add product count to each deal (only counting products with available variants)
        deals = deals.map(deal => {
            const dealProductCount = availableDealProducts.filter(dp => dp.deal_id === deal.id).length;
            return {
                ...deal.toJSON(),
                product_count: dealProductCount
            };
        });

    } else if (entityType === 'brand') {
        // Step 1: Get brand details
        const brand = await Brand.findByPk(entityId);
        if (!brand) {
            return { deals: [], deals_text: '' };
        }
        categoryName = brand.name;

        // Step 2: Get product IDs from ProductBrand using brand ID
        const productBrands = await ProductBrand.findAll({
            where: { brand_id: entityId },
            attributes: ['product_id']
        });

        if (productBrands.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const productIds = productBrands.map(pb => pb.product_id);

        // Step 3: Get deal IDs from DealProduct using product IDs with stock check
        const dealProducts = await DealProduct.findAll({
            where: { product_id: { [Op.in]: productIds } },
            attributes: ['deal_id', 'product_id'],
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: { status: 'published' },
                    attributes: ['id', 'name', 'slug'],
                    include: [
                        {
                            model: ProductVariant,
                            as: 'variants',
                            attributes: ['id', 'stock', 'stock_status'],
                            where: { 
                                stock: { [Op.gt]: 0 },
                                deleted_at: null
                            },
                            required: false
                        }
                    ]
                }
            ]
        });

        if (dealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        // Filter deals to only include those where all products have available variants
        const availableDealProducts = dealProducts.filter(dp => {
            const product = dp.product;
            // Check if product has at least one variant with stock > 0
            return product.variants && product.variants.length > 0;
        });

        if (availableDealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const dealIds = [...new Set(availableDealProducts.map(dp => dp.deal_id))];

        // Step 4: Get deal data from Deal using deal IDs
        deals = await Deal.findAll({
            where: {
                id: { [Op.in]: dealIds },
                ...dealFilter
            },
            attributes: [
                'id', 
                'name', 
                'slug',
                'description',
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt'
            ]
        });

        // Add product count to each deal (only counting products with available variants)
        deals = deals.map(deal => {
            const dealProductCount = availableDealProducts.filter(dp => dp.deal_id === deal.id).length;
            return {
                ...deal.toJSON(),
                product_count: dealProductCount
            };
        });
    }

    // Generate deals text
    let dealsText = '';
    if (deals.length > 0) {
        const dealResults = deals.slice(0, 2); // Take first 2 deals

        if (dealResults.length === 1) {
            const deal = dealResults[0];
            if (deal.fixed_price) {
                dealsText = `Get the most for your money with our amazing ${deal.required_qty} for £${deal.fixed_price} deal on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else if (deal.discount_percent) {
                dealsText = `Get the most for your money with our amazing ${deal.discount_percent}% off deal on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else {
                dealsText = `Get the most for your money with our amazing deals on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            }
        } else if (dealResults.length >= 2) {
            const deal1 = dealResults[0];
            const deal2 = dealResults[1];
            
            let deal1Text = '';
            let deal2Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal and ${deal2Text} offer on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        }
    }

    return {
        deals,
        deals_text: dealsText
    };
    }, 120);
};

/**
 * OPTIMIZED: Batch version of getDealsForEntity
 * Fetches deals for multiple entities in a single optimized operation
 * @param {Array} entities - Array of objects with { type, id } 
 * @returns {Map} Map with key 'type_id' => { deals, deals_text }
 */
const getBatchDealsForEntities = async (entities) => {
    if (!entities || entities.length === 0) {
        return new Map();
    }

    const dealFilter = {
        is_active: true,
        is_deleted: false,
        valid_from: { [Op.lte]: new Date() },
        valid_to: { [Op.gte]: new Date() }
    };

    // Separate entities by type
    const categoryIds = entities.filter(e => e.type === 'category').map(e => e.id);
    const brandIds = entities.filter(e => e.type === 'brand').map(e => e.id);

    // Batch fetch all entity details in parallel
    const [categories, brands] = await Promise.all([
        categoryIds.length > 0 ? Category.findAll({
            where: { id: { [Op.in]: categoryIds } },
            attributes: ['id', 'name'],
            raw: true
        }) : Promise.resolve([]),
        
        brandIds.length > 0 ? Brand.findAll({
            where: { id: { [Op.in]: brandIds } },
            attributes: ['id', 'name'],
            raw: true
        }) : Promise.resolve([])
    ]);

    // Create entity name maps
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    // Batch fetch product IDs for all categories and brands in parallel
    const [productCategories, productBrands] = await Promise.all([
        categoryIds.length > 0 ? ProductCategory.findAll({
            where: { category_id: { [Op.in]: categoryIds } },
            attributes: ['category_id', 'product_id'],
            raw: true
        }) : Promise.resolve([]),
        
        brandIds.length > 0 ? ProductBrand.findAll({
            where: { brand_id: { [Op.in]: brandIds } },
            attributes: ['brand_id', 'product_id'],
            raw: true
        }) : Promise.resolve([])
    ]);

    // Group product IDs by entity
    const entityProductMap = new Map();
    
    productCategories.forEach(pc => {
        const key = `category_${pc.category_id}`;
        if (!entityProductMap.has(key)) {
            entityProductMap.set(key, []);
        }
        entityProductMap.get(key).push(pc.product_id);
    });

    productBrands.forEach(pb => {
        const key = `brand_${pb.brand_id}`;
        if (!entityProductMap.has(key)) {
            entityProductMap.set(key, []);
        }
        entityProductMap.get(key).push(pb.product_id);
    });

    // Collect all unique product IDs
    const allProductIds = [...new Set([
        ...productCategories.map(pc => pc.product_id),
        ...productBrands.map(pb => pb.product_id)
    ])];

    if (allProductIds.length === 0) {
        // Return empty results for all entities
        const results = new Map();
        entities.forEach(entity => {
            results.set(`${entity.type}_${entity.id}`, { deals: [], deals_text: '' });
        });
        return results;
    }

    // Batch fetch all deal products with stock check in one query
    const dealProducts = await DealProduct.findAll({
        where: { product_id: { [Op.in]: allProductIds } },
        attributes: ['deal_id', 'product_id'],
        include: [
            {
                model: Product,
                as: 'product',
                where: { status: 'published' },
                attributes: ['id', 'name', 'slug'],
                include: [
                    {
                        model: ProductVariant,
                        as: 'variants',
                        attributes: ['id', 'stock', 'stock_status'],
                        where: { 
                            stock: { [Op.gt]: 0 },
                            deleted_at: null
                        },
                        required: false
                    }
                ]
            }
        ]
    });

    // Filter to only include products with available variants
    const availableDealProducts = dealProducts.filter(dp => {
        const product = dp.product;
        return product.variants && product.variants.length > 0;
    });

    if (availableDealProducts.length === 0) {
        // Return empty results for all entities
        const results = new Map();
        entities.forEach(entity => {
            results.set(`${entity.type}_${entity.id}`, { deals: [], deals_text: '' });
        });
        return results;
    }

    // Get unique deal IDs
    const dealIds = [...new Set(availableDealProducts.map(dp => dp.deal_id))];

    // Batch fetch all deals
    const deals = await Deal.findAll({
        where: {
            id: { [Op.in]: dealIds },
            ...dealFilter
        },
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
            'bundle_product_ids_json',
            'valid_from',
            'valid_to',
            'image_url',
            'createdAt'
        ]
    });

    // Create deal map
    const dealMap = new Map(deals.map(d => [d.id, d.toJSON()]));

    // Build results for each entity
    const results = new Map();

    entities.forEach(entity => {
        const key = `${entity.type}_${entity.id}`;
        const productIds = entityProductMap.get(key) || [];
        
        if (productIds.length === 0) {
            results.set(key, { deals: [], deals_text: '' });
            return;
        }

        // Find deal products for this entity's products
        const entityDealProducts = availableDealProducts.filter(dp => 
            productIds.includes(dp.product_id)
        );

        if (entityDealProducts.length === 0) {
            results.set(key, { deals: [], deals_text: '' });
            return;
        }

        // Get unique deal IDs for this entity
        const entityDealIds = [...new Set(entityDealProducts.map(dp => dp.deal_id))];

        // Get deals for this entity
        const entityDeals = entityDealIds
            .map(dealId => dealMap.get(dealId))
            .filter(Boolean)
            .map(deal => {
                const dealProductCount = entityDealProducts.filter(dp => dp.deal_id === deal.id).length;
                return {
                    ...deal,
                    product_count: dealProductCount
                };
            });

        // Generate deals text
        const entityName = entity.type === 'category' 
            ? (categoryMap.get(entity.id) || 'products')
            : (brandMap.get(entity.id) || 'products');

        let dealsText = '';
        if (entityDeals.length > 0) {
            const dealResults = entityDeals.slice(0, 2);

            if (dealResults.length === 1) {
                const deal = dealResults[0];
                if (deal.fixed_price) {
                    dealsText = `Get the most for your money with our amazing ${deal.required_qty} for £${deal.fixed_price} deal on ${entityName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
                } else if (deal.discount_percent) {
                    dealsText = `Get the most for your money with our amazing ${deal.discount_percent}% off deal on ${entityName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
                } else {
                    dealsText = `Get the most for your money with our amazing deals on ${entityName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
                }
            } else if (dealResults.length >= 2) {
                const deal1 = dealResults[0];
                const deal2 = dealResults[1];
                
                let deal1Text = '';
                let deal2Text = '';

                if (deal1.fixed_price) {
                    deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
                } else if (deal1.discount_percent) {
                    deal1Text = `${deal1.discount_percent}% off`;
                } else {
                    deal1Text = 'amazing deal';
                }

                if (deal2.fixed_price) {
                    deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
                } else if (deal2.discount_percent) {
                    deal2Text = `${deal2.discount_percent}% off`;
                } else {
                    deal2Text = 'amazing offer';
                }

                dealsText = `Get the most for your money with our amazing ${deal1Text} deal and ${deal2Text} offer on ${entityName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            }
        }

        results.set(key, {
            deals: entityDeals,
            deals_text: dealsText
        });
    });

    return results;
};

const getDealsForEntityOriginal = async (entityType, entityId) => {
    // Build deal filter
    const dealFilter = {
        is_active: true,
        is_deleted: false,
        valid_from: { [Op.lte]: new Date() },
        valid_to: { [Op.gte]: new Date() }
    };

    let deals = [];
    let categoryName = 'products';

    if (entityType === 'category') {
        // Step 1: Get category details
        const category = await Category.findByPk(entityId);
        if (!category) {
            return { deals: [], deals_text: '' };
        }
        categoryName = category.name;

        // Step 2: Get product IDs from ProductCategory using category ID
        const productCategories = await ProductCategory.findAll({
            where: { category_id: entityId },
            attributes: ['product_id']
        });

        if (productCategories.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const productIds = productCategories.map(pc => pc.product_id);

        // Step 3: Get deal IDs from DealProduct using product IDs with stock check
        const dealProducts = await DealProduct.findAll({
            where: { product_id: { [Op.in]: productIds } },
            attributes: ['deal_id', 'product_id'],
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: { status: 'published' },
                    attributes: ['id', 'name', 'slug'],
                    include: [
                        {
                            model: ProductVariant,
                            as: 'variants',
                            attributes: ['id', 'stock', 'stock_status'],
                            where: { 
                                stock: { [Op.gt]: 0 },
                                deleted_at: null
                            },
                            required: false
                        }
                    ]
                }
            ]
        });

        if (dealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        // Filter deals to only include those where all products have available variants
        const availableDealProducts = dealProducts.filter(dp => {
            const product = dp.product;
            // Check if product has at least one variant with stock > 0
            return product.variants && product.variants.length > 0;
        });

        if (availableDealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const dealIds = [...new Set(availableDealProducts.map(dp => dp.deal_id))];

        // Step 4: Get deal data from Deal using deal IDs
        deals = await Deal.findAll({
            where: {
                id: { [Op.in]: dealIds },
                ...dealFilter
            },
            attributes: [
                'id', 
                'name', 
                'slug',
                'description',
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt'
            ]
        });

        // Add product count to each deal (only counting products with available variants)
        deals = deals.map(deal => {
            const dealProductCount = availableDealProducts.filter(dp => dp.deal_id === deal.id).length;
            return {
                ...deal.toJSON(),
                product_count: dealProductCount
            };
        });

    } else if (entityType === 'brand') {
        // Step 1: Get brand details
        const brand = await Brand.findByPk(entityId);
        if (!brand) {
            return { deals: [], deals_text: '' };
        }
        categoryName = brand.name;

        // Step 2: Get product IDs from ProductBrand using brand ID
        const productBrands = await ProductBrand.findAll({
            where: { brand_id: entityId },
            attributes: ['product_id']
        });

        if (productBrands.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const productIds = productBrands.map(pb => pb.product_id);

        // Step 3: Get deal IDs from DealProduct using product IDs with stock check
        const dealProducts = await DealProduct.findAll({
            where: { product_id: { [Op.in]: productIds } },
            attributes: ['deal_id', 'product_id'],
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: { status: 'published' },
                    attributes: ['id', 'name', 'slug'],
                    include: [
                        {
                            model: ProductVariant,
                            as: 'variants',
                            attributes: ['id', 'stock', 'stock_status'],
                            where: { 
                                stock: { [Op.gt]: 0 },
                                deleted_at: null
                            },
                            required: false
                        }
                    ]
                }
            ]
        });

        if (dealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        // Filter deals to only include those where all products have available variants
        const availableDealProducts = dealProducts.filter(dp => {
            const product = dp.product;
            // Check if product has at least one variant with stock > 0
            return product.variants && product.variants.length > 0;
        });

        if (availableDealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const dealIds = [...new Set(availableDealProducts.map(dp => dp.deal_id))];

        // Step 4: Get deal data from Deal using deal IDs
        deals = await Deal.findAll({
            where: {
                id: { [Op.in]: dealIds },
                ...dealFilter
            },
            attributes: [
                'id', 
                'name', 
                'slug',
                'description',
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt'
            ]
        });

        // Add product count to each deal (only counting products with available variants)
        deals = deals.map(deal => {
            const dealProductCount = availableDealProducts.filter(dp => dp.deal_id === deal.id).length;
            return {
                ...deal.toJSON(),
                product_count: dealProductCount
            };
        });
    }

    // Generate deals text
    let dealsText = '';
    if (deals.length > 0) {
        const dealResults = deals.slice(0, 2); // Take first 2 deals

        if (dealResults.length === 1) {
            const deal = dealResults[0];
            if (deal.fixed_price) {
                dealsText = `Get the most for your money with our amazing ${deal.required_qty} for £${deal.fixed_price} deal on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else if (deal.discount_percent) {
                dealsText = `Get the most for your money with our amazing ${deal.discount_percent}% off deal on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else {
                dealsText = `Get the most for your money with our amazing deals on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            }
        } else if (dealResults.length >= 2) {
            const deal1 = dealResults[0];
            const deal2 = dealResults[1];
            
            let deal1Text = '';
            let deal2Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal and ${deal2Text} offer on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        }
    }

    return {
        deals,
        deals_text: dealsText
    };
};

/**
 * Get the latest 3 active deals
 * @returns {Object} Object containing deals array and descriptive text
 */
const getLatestDeals = async () => {
    const dealFilter = {
        is_active: true,
        is_deleted: false,
        valid_from: { [Op.lte]: new Date() },
        valid_to: { [Op.gte]: new Date() },
        show_home_page: true
    };

    const deals = await Deal.findAll({
        where: dealFilter,
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
            'bundle_product_ids_json',
            'valid_from',
            'valid_to',
            'image_url',
            'createdAt'
        ],
        order: [['createdAt', 'DESC']],
        limit: 3
    });

    // Generate descriptive text based on deals
    let dealsText = '';
    if (deals.length > 0) {
        if (deals.length === 1) {
            const deal = deals[0];
            if (deal.fixed_price) {
                dealsText = `Get the most for your money with our amazing ${deal.required_qty} for £${deal.fixed_price} deal! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else if (deal.discount_percent) {
                dealsText = `Get the most for your money with our amazing ${deal.discount_percent}% off deal! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else {
                dealsText = `Get the most for your money with our amazing deals! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            }
        } else if (deals.length === 2) {
            const deal1 = deals[0];
            const deal2 = deals[1];
            
            let deal1Text = '';
            let deal2Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal and ${deal2Text} offer! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        } else {
            const deal1 = deals[0];
            const deal2 = deals[1];
            const deal3 = deals[2];
            
            let deal1Text = '';
            let deal2Text = '';
            let deal3Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            if (deal3.fixed_price) {
                deal3Text = `${deal3.required_qty} for £${deal3.fixed_price}`;
            } else if (deal3.discount_percent) {
                deal3Text = `${deal3.discount_percent}% off`;
            } else {
                deal3Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal, ${deal2Text} offer, and ${deal3Text} offer! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        }
    } else {
        dealsText = 'No active deals available at the moment';
    }

    return {
        deals: deals,
        deals_text: dealsText
    };
};

const getLatestDealsOriginal = async () => {
    const dealFilter = {
        is_active: true,
        is_deleted: false,
        valid_from: { [Op.lte]: new Date() },
        valid_to: { [Op.gte]: new Date() },
        show_home_page: true
    };

    const deals = await Deal.findAll({
        where: dealFilter,
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
            'bundle_product_ids_json',
            'valid_from',
            'valid_to',
            'image_url',
            'createdAt'
        ],
        order: [['createdAt', 'DESC']],
        limit: 3
    });

    // Generate descriptive text based on deals
    let dealsText = '';
    if (deals.length > 0) {
        if (deals.length === 1) {
            const deal = deals[0];
            if (deal.fixed_price) {
                dealsText = `Get the most for your money with our amazing ${deal.required_qty} for £${deal.fixed_price} deal! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else if (deal.discount_percent) {
                dealsText = `Get the most for your money with our amazing ${deal.discount_percent}% off deal! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else {
                dealsText = `Get the most for your money with our amazing deals! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            }
        } else if (deals.length === 2) {
            const deal1 = deals[0];
            const deal2 = deals[1];
            
            let deal1Text = '';
            let deal2Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal and ${deal2Text} offer! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        } else {
            const deal1 = deals[0];
            const deal2 = deals[1];
            const deal3 = deals[2];
            
            let deal1Text = '';
            let deal2Text = '';
            let deal3Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            if (deal3.fixed_price) {
                deal3Text = `${deal3.required_qty} for £${deal3.fixed_price}`;
            } else if (deal3.discount_percent) {
                deal3Text = `${deal3.discount_percent}% off`;
            } else {
                deal3Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal, ${deal2Text} offer, and ${deal3Text} offer! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        }
    } else {
        dealsText = 'No active deals available at the moment';
    }

    return {
        deals: deals,
        deals_text: dealsText
    };
};

module.exports.getHomeCarousel = async (req, res, next) => {
    try {
        const carousels = await cacheOrFetch('homepage:carousels', () => Carousel.findAll({
            order: [["display_order", "ASC"]]
        }), 300);
        successResponse(res, carousels, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createHomeCarousel = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await Carousel.findAll({ where: { display_order } })
        if (existing.length > 0) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }
        const carousel = await Carousel.create({ display_order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, carousel, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.uploadBannerImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }
        const user_id = req?.user?.id;
        const file = req.file;
        const { originalname, mimetype, buffer } = file;
        const fileName = `public-images/${user_id}_${Date.now()}_${originalname}`;
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: buffer,
            ContentType: mimetype
        }

        // Upload image to S3 (or any cloud storage)
        const imageUrl = await uploadFiletToS3(params);

        return successResponse(res, imageUrl, "Image uploaded successfully");
    } catch (error) {
        return errorResponse(res, error, error.message || "Failed to upload image", 500);
    }
};

module.exports.addBannerImage = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await BannerImage.findAll({ where: { display_order } })
        if (existing.length > 0) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }
        const banner = await BannerImage.create({ display_order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, banner, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getBannerImages = async (req, res, next) => {
    try {
        const banners = await cacheOrFetch('homepage:banners', () => BannerImage.findAll({
            order: [["display_order", "ASC"]]
        }), 300);
        successResponse(res, banners, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.getHomePageBlock = async (req, res, next) => {
    try {
        const data = await cacheOrFetch('homepage:page-block', async () => {
            const [shopByCategories, popularCategories] = await Promise.all([
                ShopByCategory.findAll({
                    where: { status: true, deletedAt: null },
                    include: [{
                        model: Category,
                        as: 'category',
                        attributes: ['id', 'name', 'slug', 'description', 'logo_url', 'alt_text', 'parent_id'],
                        where: { deletedAt: null },
                        required: true
                    }],
                    order: [['order', 'ASC']]
                }),
                PopularCategory.findAll({
                    where: { status: true, deletedAt: null },
                    include: [{
                        model: Category,
                        as: 'category',
                        attributes: ['id', 'name', 'slug', 'description', 'logo_url', 'alt_text', 'parent_id'],
                        where: { deletedAt: null },
                        required: true
                    }],
                    order: [['order', 'ASC']]
                })
            ]);
            return { shopByCategories, popularCategories };
        }, 300);
        return successResponse(res, data, 'Home page block retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

/**
 * Batch fetch entity banners for given entities
 * @param {Array} entities - Array of objects with type and id
 * @returns {Map} Map with key as "type_id" and value as array of banner objects
 */
const getBatchEntityBanners = async (entities) => {
    const bannerMap = new Map();
    
    if (!entities || entities.length === 0) {
        return bannerMap;
    }

    // Group entities by type
    const categoryEntities = entities.filter(e => e.type === 'category');
    const brandEntities = entities.filter(e => e.type === 'brand');
    const dealEntities = entities.filter(e => e.type === 'deal');

    // Fetch banners for categories
    if (categoryEntities.length > 0) {
        const categoryIds = categoryEntities.map(e => e.id);
        const categoryBanners = await EntityBanner.findAll({
            where: {
                type: 'category',
                category_id: { [Op.in]: categoryIds }
            },
            attributes: ['id', 'type', 'category_id', 'brand_id', 'deals_id', 'image', 'alt', 'url', 'order'],
            order: [['order', 'ASC']]
        });

        categoryBanners.forEach(banner => {
            const key = `category_${banner.category_id}`;
            if (!bannerMap.has(key)) {
                bannerMap.set(key, []);
            }
            bannerMap.get(key).push({
                image: banner.image,
                alt: banner.alt,
                url: banner.url,
                order: banner.order
            });
        });
    }

    // Fetch banners for brands
    if (brandEntities.length > 0) {
        const brandIds = brandEntities.map(e => e.id);
        const brandBanners = await EntityBanner.findAll({
            where: {
                type: 'brand',
                brand_id: { [Op.in]: brandIds }
            },
            attributes: ['id', 'type', 'category_id', 'brand_id', 'deals_id', 'image', 'alt', 'url', 'order'],
            order: [['order', 'ASC']]
        });

        brandBanners.forEach(banner => {
            const key = `brand_${banner.brand_id}`;
            if (!bannerMap.has(key)) {
                bannerMap.set(key, []);
            }
            bannerMap.get(key).push({
                image: banner.image,
                alt: banner.alt,
                url: banner.url,
                order: banner.order
            });
        });
    }

    // Fetch banners for deals
    if (dealEntities.length > 0) {
        const dealIds = dealEntities.map(e => e.id);
        const dealBanners = await EntityBanner.findAll({
            where: {
                type: 'deal',
                deals_id: { [Op.in]: dealIds }
            },
            attributes: ['id', 'type', 'category_id', 'brand_id', 'deals_id', 'image', 'alt', 'url', 'order'],
            order: [['order', 'ASC']]
        });

        dealBanners.forEach(banner => {
            const key = `deal_${banner.deals_id}`;
            if (!bannerMap.has(key)) {
                bannerMap.set(key, []);
            }
            bannerMap.get(key).push({
                image: banner.image,
                alt: banner.alt,
                url: banner.url,
                order: banner.order
            });
        });
    }

    return bannerMap;
};

/**
 * Get slug relations based on provided slugs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getSlugRelations = async (req, res, next) => {
    try {
        const { slugs } = req.query;

        // Validate input
        if (!slugs) {
            return errorResponse(res, { message: "Slugs parameter is required" }, "Slugs parameter is required", 400);
        }

        // Parse slugs from query string
        const slugArray = slugs.split(',').map(slug => slug.trim()).filter(slug => slug.length > 0);

        // Validate that we have at least one valid slug
        if (slugArray.length === 0) {
            return errorResponse(res, { message: "At least one valid slug is required" }, "At least one valid slug is required", 400);
        }

        const normalizePath = (urlOrPath) => {
            if (!urlOrPath) return '/';
            let p = String(urlOrPath).trim();
            if (/^https?:\/\//i.test(p)) {
                p = new URL(p).pathname;
            }
            p = p.startsWith('/') ? p : '/' + p;
            return p.replace(/\/$/, '') || '/';
        };

        const isSelfRedirect = (slug, redirectUrl) => {
            const canonicalPath = normalizePath('/' + String(slug).replace(/^\/+|\/+$/g, ''));
            return canonicalPath === normalizePath(redirectUrl);
        };

        const setRedirectIfValid = (map, slug, url) => {
            if (slug != null && url && !map.has(slug) && !isSelfRedirect(slug, url)) {
                map.set(slug, url);
            }
        };

        // Helper: generate path variations for redirect lookup (handles prefixes, slashes, /amp/)
        const generatePathVariations = (slug, { includePrefixes = true } = {}) => {
            const variations = new Set();
            let s = String(slug).trim();
            variations.add(s);
            variations.add('/' + s);
            variations.add(s + '/');
            variations.add('/' + s + '/');
            s = s.replace(/\/amp\/?$/, '');
            variations.add(s);
            variations.add('/' + s);
            variations.add(s + '/');
            variations.add('/' + s + '/');
            if (includePrefixes) {
                const prefixes = ['brand', 'product-tag', 'product-category', 'blog'];
                for (const prefix of prefixes) {
                    if (!s.includes('/')) {
                        variations.add(prefix + '/' + s);
                        variations.add('/' + prefix + '/' + s);
                        variations.add(prefix + '/' + s + '/');
                        variations.add('/' + prefix + '/' + s + '/');
                    }
                }
                // Add blog category specific path format: /blogs/category/{slug}
                if (!s.includes('/')) {
                    variations.add('blogs/category/' + s);
                    variations.add('/blogs/category/' + s);
                    variations.add('blogs/category/' + s + '/');
                    variations.add('/blogs/category/' + s + '/');
                }
            }
            const normalized = [];
            variations.forEach(v => {
                let n = v.trim();
                if (!n.startsWith('/')) n = '/' + n;
                n = n.replace(/\/$/, '') || '/';
                normalized.push(n);
            });
            return [...new Set(normalized)];
        };

        // Check existence of slugs in SlugRelation table
        const existingSlugs = await SlugRelation.findAll({
            where: {
                slug: {
                    [Op.in]: slugArray
                }
            },
            attributes: ['slug'],
            raw: true
        });
        const existingSlugSet = new Set(existingSlugs.map(s => s.slug));
        const nonExistentSlugs = slugArray.filter(slug => !existingSlugSet.has(slug));

        // If all slugs don't exist, check for redirects before returning error
        if (nonExistentSlugs.length === slugArray.length) {
            // Build path variations for redirect lookup
            const pathBySlug = new Map();
            slugArray.forEach(slug => {
                generatePathVariations(slug).forEach(path => {
                    if (!pathBySlug.has(path)) pathBySlug.set(path, slug);
                });
            });
            const candidatePaths = [...pathBySlug.keys()];
            
            let hasRedirect = false;
            if (candidatePaths.length > 0) {
                const tableRedirects = await Redirect.findAll({
                    where: {
                        sources: { [Op.in]: candidatePaths },
                        status: 'active'
                    },
                    attributes: ['sources', 'url_to'],
                    limit: 1
                });
                hasRedirect = tableRedirects.some((r) => {
                    const slug = pathBySlug.get(r.sources);
                    return slug != null && !isSelfRedirect(slug, r.url_to);
                });
            }

            // Check blog category redirects by entity_type and slug
            if (!hasRedirect && nonExistentSlugs.length > 0) {
                const blogCategoryRedirect = await Redirect.findOne({
                    where: {
                        entity_type: 'blog_category',
                        slug: { [Op.in]: nonExistentSlugs },
                        status: 'active',
                        deletedAt: null
                    },
                    attributes: ['slug', 'url_to']
                });
                hasRedirect = blogCategoryRedirect != null
                    && !isSelfRedirect(blogCategoryRedirect.slug, blogCategoryRedirect.url_to);
            }

            // Check soft-deleted products with redirect_url
            if (!hasRedirect && nonExistentSlugs.length > 0) {
                const redirectRows = await Product.sequelize.query(
                    `SELECT slug, redirect_url FROM products WHERE slug IN (:slugs) AND deletedAt IS NOT NULL AND redirect_url IS NOT NULL AND TRIM(redirect_url) != '' LIMIT 1`,
                    { replacements: { slugs: nonExistentSlugs }, type: Product.sequelize.QueryTypes.SELECT }
                );
                hasRedirect = redirectRows.some((r) => !isSelfRedirect(r.slug, r.redirect_url));
            }

            // If no redirects found, return error about non-existent slugs
            if (!hasRedirect) {
                return errorResponse(res, { 
                    message: "None of the provided slugs exist",
                    non_existent_slugs: nonExistentSlugs
                }, "None of the provided slugs exist", 404);
            }
        }

        // Query slug relations
        const slugRelations = await SlugRelation.findAll({
            where: {
                slug: {
                    [Op.in]: slugArray
                }
            },
            order: [
                // Order by entity type priority
                [Sequelize.literal(`FIELD(entity_type, ${Object.keys(ENTITY_TYPE_PRIORITY)
                    .map(type => `'${type}'`)
                    .join(',')})`)]
            ]
        });
        const matchedSlugSet = new Set(slugRelations.map(r => r.slug));
        const unmatchedSlugs = slugArray.filter(s => !matchedSlugSet.has(s));
        let redirectMap = new Map();

        // Build path variations for ALL slugs (matched and unmatched) so we include redirect details when found
        const pathBySlug = new Map();
        slugArray.forEach(slug => {
            const includePrefixes = !existingSlugSet.has(slug);
            generatePathVariations(slug, { includePrefixes }).forEach(path => {
                if (!pathBySlug.has(path)) pathBySlug.set(path, slug);
            });
        });
        const candidatePaths = [...pathBySlug.keys()];
        if (candidatePaths.length > 0) {
            const tableRedirects = await Redirect.findAll({
                where: {
                    sources: { [Op.in]: candidatePaths },
                    status: 'active'
                },
                attributes: ['sources', 'url_to']
            });
            tableRedirects.forEach(r => {
                const slug = pathBySlug.get(r.sources);
                setRedirectIfValid(redirectMap, slug, r.url_to);
            });
        }

        // Check for blog category redirects by entity_type and slug (more reliable than path matching)
        if (slugArray.length > 0) {
            const blogCategoryRedirects = await Redirect.findAll({
                where: {
                    entity_type: 'blog_category',
                    slug: { [Op.in]: slugArray },
                    status: 'active',
                    deletedAt: null
                },
                attributes: ['slug', 'url_to']
            });
            blogCategoryRedirects.forEach(r => {
                setRedirectIfValid(redirectMap, r.slug, r.url_to);
            });
        }

        if (unmatchedSlugs.length > 0) {
            // Soft-deleted products with redirect_url (only for unmatched slugs)
            const redirectRows = await Product.sequelize.query(
                `SELECT slug, redirect_url FROM products WHERE slug IN (:slugs) AND deletedAt IS NOT NULL AND redirect_url IS NOT NULL AND TRIM(redirect_url) != ''`,
                { replacements: { slugs: unmatchedSlugs }, type: Product.sequelize.QueryTypes.SELECT }
            );
            redirectRows.forEach(r => setRedirectIfValid(redirectMap, r.slug, r.redirect_url));
        }
        // Handle no slug_relation matches: return redirect if found (product or redirect table), else 404
        if (!slugRelations.length) {
            if (redirectMap.size > 0) {
                if (slugArray.length === 1 && redirectMap.has(slugArray[0])) {
                    return successResponse(res, {
                        slug: slugArray[0],
                        redirect: true,
                        redirect_url: redirectMap.get(slugArray[0])
                    }, 'Redirect');
                }
                const data = slugArray
                    .filter(slug => redirectMap.has(slug))
                    .map(slug => ({ slug, entity_type: 'redirect', redirect_url: redirectMap.get(slug) }));
                return successResponse(res, { data }, 'Redirect');
            }
            return errorResponse(res, { message: "No matching slugs found" }, "No matching slugs found", 404);
        }
        // OPTIMIZED: Fetch all categories, brands, and blog categories upfront in one query each (if any exist)
        const categoryIds = slugRelations
            .filter(rel => rel.entity_type === 'category')
            .map(rel => rel.entity_id);
        
        let categoryMap = new Map();
        if (categoryIds.length > 0) {
            const categories = await Category.findAll({
                where: { id: { [Op.in]: categoryIds } },
                attributes: ['id', 'name', 'description', 'type_cards_html', 'additional_text_box', 'slug']
            });
            categoryMap = new Map(categories.map(cat => [cat.id, cat]));
        }

        const brandIds = slugRelations
            .filter(rel => rel.entity_type === 'brand')
            .map(rel => rel.entity_id);
        
        let brandMap = new Map();
        if (brandIds.length > 0) {
            const brands = await Brand.findAll({
                where: { id: { [Op.in]: brandIds } },
                attributes: ['id', 'name', 'description', 'type_cards_html', 'additional_text_box', 'slug']
            });
            brandMap = new Map(brands.map(brand => [brand.id, brand]));
        }

        let categoryGuideMap = new Map();
        if (categoryIds.length > 0) {
            const guides = await CategoryBuyingGuide.findAll({
                where: { category_id: { [Op.in]: categoryIds } },
                attributes: ['category_id', 'is_enabled']
            });
            categoryGuideMap = new Map(guides.map(g => [g.category_id, Boolean(g.is_enabled)]));
        }

        let brandGuideMap = new Map();
        if (brandIds.length > 0) {
            const guides = await BrandBuyingGuide.findAll({
                where: { brand_id: { [Op.in]: brandIds } },
                attributes: ['brand_id', 'is_enabled']
            });
            brandGuideMap = new Map(guides.map(g => [g.brand_id, Boolean(g.is_enabled)]));
        }

        const blogCategoryIds = slugRelations
            .filter(rel => rel.entity_type === 'blog_category')
            .map(rel => rel.entity_id);
        
        let blogCategoryMap = new Map();
        if (blogCategoryIds.length > 0) {
            const blogCategories = await BlogCategory.findAll({
                where: { id: { [Op.in]: blogCategoryIds } },
                attributes: ['id', 'name', 'description', 'slug']
            });
            blogCategoryMap = new Map(blogCategories.map(bc => [bc.id, bc]));
        }

        const dealIds = slugRelations
            .filter(rel => rel.entity_type === 'deal')
            .map(rel => rel.entity_id);
        
        let dealMap = new Map();
        if (dealIds.length > 0) {
            const deals = await Deal.findAll({
                where: { id: { [Op.in]: dealIds } },
                attributes: ['id', 'name', 'description', 'slug']
            });
            dealMap = new Map(deals.map(deal => [deal.id, deal]));
        }

        // OPTIMIZED: Batch fetch entity banners for brand, category, and deal entities
        const entitiesForBanners = slugRelations
            .filter(rel => ['brand', 'category', 'deal'].includes(rel.entity_type))
            .map(rel => ({
                type: rel.entity_type,
                id: rel.entity_id
            }));

        let bannerMap = new Map();
        if (entitiesForBanners.length > 0) {
            bannerMap = await getBatchEntityBanners(entitiesForBanners);
        }

        // Handle single slug query - no validation needed
        if (slugArray.length === 1) {
            const seoData = await seoService.getSeoMeta(
                getEntityType(slugRelations[0].entity_type),
                slugRelations[0].slug
            );

            const response = {
                slug: slugRelations[0].slug,
                entity_type: slugRelations[0].entity_type,
                entity_id: slugRelations[0].entity_id,
                seo: seoData
            };

            // Add category description and name if entity is category (using pre-fetched category)
            if (slugRelations[0].entity_type === 'category') {
                const category = categoryMap.get(slugRelations[0].entity_id);
                if (category) {
                    response.description = category.description;
                    response.type_cards_html = category.type_cards_html || null;
                    response.additional_text_box = category.additional_text_box || null;
                    response.name = category.name;
                }
                response.buyingGuide = {
                    is_enabled: categoryGuideMap.get(slugRelations[0].entity_id) ?? false
                };
            }

            // Add brand description and name if entity is brand (using pre-fetched brand)
            if (slugRelations[0].entity_type === 'brand') {
                const brand = brandMap.get(slugRelations[0].entity_id);
                if (brand) {
                    response.description = brand.description;
                    response.type_cards_html = brand.type_cards_html || null;
                    response.additional_text_box = brand.additional_text_box || null;
                    response.name = brand.name;
                }
                response.buyingGuide = {
                    is_enabled: brandGuideMap.get(slugRelations[0].entity_id) ?? false
                };
            }

            // Add blog category description and name if entity is blog_category (using pre-fetched blog category)
            if (slugRelations[0].entity_type === 'blog_category') {
                const blogCategory = blogCategoryMap.get(slugRelations[0].entity_id);
                if (blogCategory) {
                    response.description = blogCategory.description;
                    response.name = blogCategory.name;
                } else {
                    // Blog category is soft-deleted (slug relation exists but category not found)
                    // Check if there's a redirect, if not return 404
                    if (!redirectMap.has(slugRelations[0].slug)) {
                        return errorResponse(res, { 
                            message: "Blog category not found or has been deleted"
                        }, "Blog category not found", 404);
                    }
                }
            }

            // Add deal description and name if entity is deal (using pre-fetched deal)
            if (slugRelations[0].entity_type === 'deal') {
                const deal = dealMap.get(slugRelations[0].entity_id);
                if (deal) {
                    response.description = deal.description;
                    response.name = deal.name;
                }
            }

            // Add entity banners if entity is brand, category, or deal
            if (['brand', 'category', 'deal'].includes(slugRelations[0].entity_type)) {
                const key = `${slugRelations[0].entity_type}_${slugRelations[0].entity_id}`;
                const banners = bannerMap.get(key) || [];
                if (banners.length > 0) {
                    response.banners = banners;
                }
            }

            // Include deals if entity is category or brand
            if (['category', 'brand'].includes(slugRelations[0].entity_type)) {
                const dealsData = await getDealsForEntity(
                    slugRelations[0].entity_type,
                    slugRelations[0].entity_id
                );
                response.deals = dealsData.deals;
                response.deals_text = dealsData.deals_text;
            }

            // // Include latest 3 deals if entity is deal
            if (slugRelations[0].entity_type === 'deal') {
                const latestDealsData = await getLatestDeals();
                response.latest_deals = latestDealsData.deals;
                response.deals_text = latestDealsData.deals_text;
            }

            // Include redirect details when a redirect exists for this slug
            if (redirectMap.has(slugRelations[0].slug)) {
                response.redirect = true;
                response.redirect_url = redirectMap.get(slugRelations[0].slug);
            }

            return successResponse(res, response, 'Success');
        }

        // Handle multiple slugs query
        const matchedSlugs = new Set(slugRelations.map(relation => relation.slug));
        const allSlugsMatched = slugArray.every(slug => matchedSlugs.has(slug));

        if (!allSlugsMatched) {
            const relationItems = slugRelations.map(relation => {
                    const item = {
                        slug: relation.slug,
                        entity_type: relation.entity_type,
                        entity_id: relation.entity_id
                    };
                    
                    // Add redirect details when a redirect exists for this slug
                    if (redirectMap.has(relation.slug)) {
                        item.redirect = true;
                        item.redirect_url = redirectMap.get(relation.slug);
                    }
                    
                    // Add category description and name if entity is category
                    if (relation.entity_type === 'category') {
                        const category = categoryMap.get(relation.entity_id);
                        if (category) {
                            item.description = category.description;
                            item.type_cards_html = category.type_cards_html || null;
                            item.additional_text_box = category.additional_text_box || null;
                            item.name = category.name;
                        }
                        item.buyingGuide = {
                            is_enabled: categoryGuideMap.get(relation.entity_id) ?? false
                        };
                    }
                    
                    // Add brand description and name if entity is brand
                    if (relation.entity_type === 'brand') {
                        const brand = brandMap.get(relation.entity_id);
                        if (brand) {
                            item.description = brand.description;
                            item.type_cards_html = brand.type_cards_html || null;
                            item.additional_text_box = brand.additional_text_box || null;
                            item.name = brand.name;
                        }
                        item.buyingGuide = {
                            is_enabled: brandGuideMap.get(relation.entity_id) ?? false
                        };
                    }
                    
                    // Add blog category description and name if entity is blog_category
                    if (relation.entity_type === 'blog_category') {
                        const blogCategory = blogCategoryMap.get(relation.entity_id);
                        if (blogCategory) {
                            item.description = blogCategory.description;
                            item.name = blogCategory.name;
                        } else if (!redirectMap.has(relation.slug)) {
                            // Blog category is soft-deleted and no redirect - skip this item
                            return null;
                        }
                    }
                    
                    // Add deal description and name if entity is deal
                    if (relation.entity_type === 'deal') {
                        const deal = dealMap.get(relation.entity_id);
                        if (deal) {
                            item.description = deal.description;
                            item.name = deal.name;
                        }
                    }
                    
                    // Add entity banners if entity is brand, category, or deal
                    if (['brand', 'category', 'deal'].includes(relation.entity_type)) {
                        const key = `${relation.entity_type}_${relation.entity_id}`;
                        const banners = bannerMap.get(key) || [];
                        if (banners.length > 0) {
                            item.banners = banners;
                        }
                    }
                    
                    return item;
                }).filter(item => item !== null); // Filter out null items (soft-deleted blog categories without redirects)
            const redirectItems = Array.from(redirectMap.entries()).map(([slug, redirect_url]) => ({
                slug,
                entity_type: 'redirect',
                redirect_url
            }));
            const response = {
                message: 'Partial matches found, refine your query if needed',
                data: relationItems.concat(redirectItems)
            };

            // OPTIMIZED: Batch fetch deals for all matched slugs
            const entitiesForDeals = slugRelations
                .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                .map(relation => ({
                    type: relation.entity_type,
                    id: relation.entity_id
                }));

            if (entitiesForDeals.length > 0) {
                const dealsMap = await getBatchDealsForEntities(entitiesForDeals);
                
                const dealsResults = slugRelations
                    .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                    .map(relation => {
                        const key = `${relation.entity_type}_${relation.entity_id}`;
                        const dealsData = dealsMap.get(key) || { deals: [], deals_text: '' };
                        return {
                            slug: relation.slug,
                            deals: dealsData.deals,
                            deals_text: dealsData.deals_text
                        };
                    });

                if (dealsResults.length > 0) {
                    response.deals_by_slug = dealsResults;
                }
            }

            return successResponse(res, response, 'Success');
        }

        // For pairs, validate hierarchical relationships
        if (slugArray.length === 2) {
            // Sort relations by priority to ensure parent comes first
            const sortedRelations = slugRelations.sort((a, b) => 
                ENTITY_TYPE_PRIORITY[a.entity_type] - ENTITY_TYPE_PRIORITY[b.entity_type]
            );

            const [parent, child] = sortedRelations;

            // Define valid hierarchical relationships
            const validHierarchy = {
                category: {
                    validChildTypes: ['subcategory', 'product'],
                    errorMessage: 'A category slug can only be followed by a subcategory or product slug'
                },
                brand: {
                    validChildTypes: ['subbrand', 'product'],
                    errorMessage: 'A brand slug can only be followed by a sub-brand or product slug'
                },
                product: {
                    validChildTypes: ['product_variant'],
                    errorMessage: 'A product slug can only be followed by a product variant slug'
                },
                blog_category: {
                    validChildTypes: ['blog_variant'],
                    errorMessage: 'A blog category slug can only be followed by a blog variant slug'
                },
                deal: {
                    validChildTypes: ['deal_variant'],
                    errorMessage: 'A deal slug can only be followed by a deal variant slug'
                }
            };

            // Validate hierarchy
            const parentRules = validHierarchy[parent.entity_type];
            if (!parentRules) {
                return errorResponse(res, {
                    message: "Invalid parent slug type",
                    details: `Only category, brand, product, and blog_category can be parent slugs`,
                    allowedParents: Object.keys(validHierarchy),
                    received: parent.entity_type
                }, "Invalid hierarchy", 400);
            }

            if (!parentRules.validChildTypes.includes(child.entity_type)) {
                return errorResponse(res, {
                    message: "Invalid slug hierarchy",
                    details: parentRules.errorMessage,
                    parent: {
                        slug: parent.slug,
                        type: parent.entity_type
                    },
                    child: {
                        slug: child.slug,
                        type: child.entity_type
                    },
                    allowedChildTypes: parentRules.validChildTypes
                }, "Invalid hierarchy", 400);
            }

            const response = sortedRelations.map(relation => {
                const item = {
                    slug: relation.slug,
                    entity_type: relation.entity_type,
                    entity_id: relation.entity_id
                };
                
                // Add category description and name if entity is category
                if (relation.entity_type === 'category') {
                    const category = categoryMap.get(relation.entity_id);
                    if (category) {
                        item.description = category.description;
                        item.type_cards_html = category.type_cards_html || null;
                        item.additional_text_box = category.additional_text_box || null;
                        item.name = category.name;
                    }
                    item.buyingGuide = {
                        is_enabled: categoryGuideMap.get(relation.entity_id) ?? false
                    };
                }
                
                // Add brand description and name if entity is brand
                if (relation.entity_type === 'brand') {
                    const brand = brandMap.get(relation.entity_id);
                    if (brand) {
                        item.description = brand.description;
                        item.type_cards_html = brand.type_cards_html || null;
                        item.additional_text_box = brand.additional_text_box || null;
                        item.name = brand.name;
                    }
                    item.buyingGuide = {
                        is_enabled: brandGuideMap.get(relation.entity_id) ?? false
                    };
                }
                
                // Add blog category description and name if entity is blog_category
                if (relation.entity_type === 'blog_category') {
                    const blogCategory = blogCategoryMap.get(relation.entity_id);
                    if (blogCategory) {
                        item.description = blogCategory.description;
                        item.name = blogCategory.name;
                    } else if (!redirectMap.has(relation.slug)) {
                        // Blog category is soft-deleted and no redirect - return error
                        return errorResponse(res, { 
                            message: "Blog category not found or has been deleted",
                            slug: relation.slug
                        }, "Blog category not found", 404);
                    }
                }
                
                // Add deal description and name if entity is deal
                if (relation.entity_type === 'deal') {
                    const deal = dealMap.get(relation.entity_id);
                    if (deal) {
                        item.description = deal.description;
                        item.name = deal.name;
                    }
                }
                
                // Add entity banners if entity is brand, category, or deal
                if (['brand', 'category', 'deal'].includes(relation.entity_type)) {
                    const key = `${relation.entity_type}_${relation.entity_id}`;
                    const banners = bannerMap.get(key) || [];
                    if (banners.length > 0) {
                        item.banners = banners;
                    }
                }
                
                // Add redirect details when a redirect exists for this slug
                if (redirectMap.has(relation.slug)) {
                    item.redirect = true;
                    item.redirect_url = redirectMap.get(relation.slug);
                }
                
                return item;
            });

            // OPTIMIZED: Batch fetch deals for category/brand slugs
            const entitiesForDeals = sortedRelations
                .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                .map(relation => ({
                    type: relation.entity_type,
                    id: relation.entity_id
                }));

            if (entitiesForDeals.length > 0) {
                const dealsMap = await getBatchDealsForEntities(entitiesForDeals);
                
                const dealsResults = sortedRelations
                    .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                    .map(relation => {
                        const key = `${relation.entity_type}_${relation.entity_id}`;
                        const dealsData = dealsMap.get(key) || { deals: [], deals_text: '' };
                        return {
                            slug: relation.slug,
                            deals: dealsData.deals,
                            deals_text: dealsData.deals_text
                        };
                    });

                if (dealsResults.length > 0) {
                    return successResponse(res, {
                        relations: response,
                        deals_by_slug: dealsResults
                    }, 'Success');
                }
            }

            // If validation passes, return the pair
            return successResponse(res, response, 'Success');
        }

        // If more than 2 slugs, return error
        return errorResponse(res, {
            message: "Invalid number of slugs",
            details: "Only single slugs or pairs are supported"
        }, "Invalid request", 400);

    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getSlugRelationsOriginal = async (req, res, next) => {
    try {
        const { slugs } = req.query;

        // Validate input
        if (!slugs) {
            return errorResponse(res, { message: "Slugs parameter is required" }, "Slugs parameter is required", 400);
        }

        // Parse slugs from query string
        const slugArray = slugs.split(',').map(slug => slug.trim());

        // Query slug relations
        const slugRelations = await SlugRelation.findAll({
            where: {
                slug: {
                    [Op.in]: slugArray
                }
            },
            order: [
                // Order by entity type priority
                [Sequelize.literal(`FIELD(entity_type, ${Object.keys(ENTITY_TYPE_PRIORITY)
                    .map(type => `'${type}'`)
                    .join(',')})`)]
            ]
        });
        // Handle no matches
        if (!slugRelations.length) {
            return errorResponse(res, { message: "No matching slugs found" }, "No matching slugs found", 404);
        }

        // Handle single slug query - no validation needed
        if (slugArray.length === 1) {
            const seoData = await seoService.getSeoMeta(
                getEntityType(slugRelations[0].entity_type),
                slugRelations[0].slug
            );

            const response = {
                slug: slugRelations[0].slug,
                entity_type: slugRelations[0].entity_type,
                entity_id: slugRelations[0].entity_id,
                seo: seoData
            };

            // Include deals if entity is category or brand
            if (['category', 'brand'].includes(slugRelations[0].entity_type)) {
                const dealsData = await getDealsForEntity(
                    slugRelations[0].entity_type,
                    slugRelations[0].entity_id
                );
                response.deals = dealsData.deals;
                response.deals_text = dealsData.deals_text;
            }

            // // Include latest 3 deals if entity is deal
            if (slugRelations[0].entity_type === 'deal') {
                const latestDealsData = await getLatestDeals();
                response.latest_deals = latestDealsData.deals;
                response.deals_text = latestDealsData.deals_text;
            }

            return successResponse(res, response, 'Success');
        }

        // Handle multiple slugs query
        const matchedSlugs = new Set(slugRelations.map(relation => relation.slug));
        const allSlugsMatched = slugArray.every(slug => matchedSlugs.has(slug));

        if (!allSlugsMatched) {
            const response = {
                message: 'Partial matches found, refine your query if needed',
                data: slugRelations.map(relation => ({
                    slug: relation.slug,
                    entity_type: relation.entity_type,
                    entity_id: relation.entity_id
                }))
            };

            // Include deals for each matched slug
            const dealsPromises = slugRelations
                .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                .map(async (relation) => {
                    const dealsData = await getDealsForEntity(
                        relation.entity_type,
                        relation.entity_id
                    );
                    return {
                        slug: relation.slug,
                        deals: dealsData.deals,
                        deals_text: dealsData.deals_text
                    };
                });

            const dealsResults = await Promise.all(dealsPromises);
            if (dealsResults.length > 0) {
                response.deals_by_slug = dealsResults;
            }

            return successResponse(res, response, 'Success');
        }

        // For pairs, validate hierarchical relationships
        if (slugArray.length === 2) {
            // Sort relations by priority to ensure parent comes first
            const sortedRelations = slugRelations.sort((a, b) => 
                ENTITY_TYPE_PRIORITY[a.entity_type] - ENTITY_TYPE_PRIORITY[b.entity_type]
            );

            const [parent, child] = sortedRelations;

            // Define valid hierarchical relationships
            const validHierarchy = {
                category: {
                    validChildTypes: ['subcategory', 'product'],
                    errorMessage: 'A category slug can only be followed by a subcategory or product slug'
                },
                brand: {
                    validChildTypes: ['subbrand', 'product'],
                    errorMessage: 'A brand slug can only be followed by a sub-brand or product slug'
                },
                product: {
                    validChildTypes: ['product_variant'],
                    errorMessage: 'A product slug can only be followed by a product variant slug'
                },
                blog_category: {
                    validChildTypes: ['blog_variant'],
                    errorMessage: 'A blog category slug can only be followed by a blog variant slug'
                },
                deal: {
                    validChildTypes: ['deal_variant'],
                    errorMessage: 'A deal slug can only be followed by a deal variant slug'
                }
            };

            // Validate hierarchy
            const parentRules = validHierarchy[parent.entity_type];
            if (!parentRules) {
                return errorResponse(res, {
                    message: "Invalid parent slug type",
                    details: `Only category, brand, product, and blog_category can be parent slugs`,
                    allowedParents: Object.keys(validHierarchy),
                    received: parent.entity_type
                }, "Invalid hierarchy", 400);
            }

            if (!parentRules.validChildTypes.includes(child.entity_type)) {
                return errorResponse(res, {
                    message: "Invalid slug hierarchy",
                    details: parentRules.errorMessage,
                    parent: {
                        slug: parent.slug,
                        type: parent.entity_type
                    },
                    child: {
                        slug: child.slug,
                        type: child.entity_type
                    },
                    allowedChildTypes: parentRules.validChildTypes
                }, "Invalid hierarchy", 400);
            }

            const response = sortedRelations.map(relation => ({
                slug: relation.slug,
                entity_type: relation.entity_type,
                entity_id: relation.entity_id
            }));

            // Include deals for category/brand slugs
            const dealsPromises = sortedRelations
                .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                .map(async (relation) => {
                    const dealsData = await getDealsForEntity(
                        relation.entity_type,
                        relation.entity_id
                    );
                    return {
                        slug: relation.slug,
                        deals: dealsData.deals,
                        deals_text: dealsData.deals_text
                    };
                });

            const dealsResults = await Promise.all(dealsPromises);
            if (dealsResults.length > 0) {
                return successResponse(res, {
                    relations: response,
                    deals_by_slug: dealsResults
                }, 'Success');
            }

            // If validation passes, return the pair
            return successResponse(res, response, 'Success');
        }

        // If more than 2 slugs, return error
        return errorResponse(res, {
            message: "Invalid number of slugs",
            details: "Only single slugs or pairs are supported"
        }, "Invalid request", 400);

    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

// Get all active sections with their links (public)
module.exports.getFooterSections = async (req, res) => {
    try {
      const sections = await FooterSection.findAll({
        where: {
          is_active: true,
          deleted_at: null
        },
        order: [['order', 'ASC']],
        include: [{
          model: FooterLink,
          as: 'links',
          where: {
            is_active: true,
            deleted_at: null
          },
          order: [['order', 'ASC']]
        }]
      });
      res.json({
        success: true,
        data: sections
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch footer sections'
      });
    }
};

/**
 * Get active flash news (cached)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getFlashNews = async (req, res, next) => {
    try {
        const { status } = req.query;
        const cacheKey = `flash-news:list:${status !== undefined ? status : 'all'}`;

        const flashNews = await cacheOrFetch(cacheKey, async () => {
            const whereClause = {};
            if (status !== undefined) {
                whereClause.status = status === 'true';
            }
            const items = await FlashNews.findAll({
                where: whereClause,
                order: [['created_at', 'DESC']],
                attributes: ['id', 'label', 'url', 'status', 'created_at'],
                include: [{
                    model: User,
                    as: 'updatedBy',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                }]
            });
            return items.map(item => item.toJSON());
        }, 300);

        return successResponse(res, flashNews, 'Flash news retrieved successfully');
    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get Trustpilot reviews with star rating categorization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getTrustpilotReviews = async (req, res, next) => {
    try {
        const { page = 1, per_page = 10, stars } = req.query;
        const pageNumber = parseInt(page, 10) || 1;
        const perPage = parseInt(per_page, 10) || 10;
        const starsFilter = stars ? String(stars) : '4,5';

        // Get access token and business unit ID
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);

        // Build query parameters
        const queryParams = {
            page: pageNumber,
            perPage,
            stars: starsFilter
        };

        // Get reviews from Trustpilot API
        const response = await axios.get(
            `https://api.trustpilot.com/v1/business-units/${businessUnitId}/reviews`,
            {
                params: queryParams,
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        // Get business unit details for overall stats
        const businessUnitResponse = await axios.get(
            `https://api.trustpilot.com/v1/business-units/${businessUnitId}`,
            {
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        const businessUnit = businessUnitResponse.data;
        const reviews = response.data.reviews || [];

        const normalizedReviews = reviews.map(review => {
            const resolvedStars = typeof review.stars === 'number' ? review.stars : 5;
            return {
                ...review,
                resolvedStars
            };
        });

        // Keep only 5-star or 4-star reviews, sorted with highest rating first
        const filteredReviews = normalizedReviews
            .filter(review => review.resolvedStars >= 4)
            .sort((a, b) => {
                if (b.resolvedStars !== a.resolvedStars) {
                    return b.resolvedStars - a.resolvedStars;
                }
                return new Date(b.createdAt) - new Date(a.createdAt);
            })
            .slice(0, perPage);

        // Get score stars from business unit
        const scoreStars = businessUnit.score.stars;
        const trustScore = businessUnit.score.trustScore;

        // Process reviews with rating categorization
        const processedReviews = filteredReviews.map(review => {
            let ratingCategory;
            const stars = review.resolvedStars;

            if (stars < 2) {
                ratingCategory = 'poor';
            } else if (stars >= 2 && stars < 4) {
                ratingCategory = 'good';
            } else if (stars >= 4 && stars < 5) {
                ratingCategory = 'excellent';
            } else if (stars === 5) {
                ratingCategory = 'outstanding';
            }

            return {
                id: review.id,
                stars,
                title: review.title,
                text: review.text,
                createdAt: review.createdAt,
                consumer: {
                    displayName: review.consumer.displayName
                },
                ratingCategory
            };
        });

        // Calculate star distribution percentages
        const totalReviews = businessUnit.numberOfReviews.total;
        const starDistribution = {
            oneStar: {
                count: businessUnit.numberOfReviews.oneStar,
                percentage: ((businessUnit.numberOfReviews.oneStar / totalReviews) * 100).toFixed(1)
            },
            twoStars: {
                count: businessUnit.numberOfReviews.twoStars,
                percentage: ((businessUnit.numberOfReviews.twoStars / totalReviews) * 100).toFixed(1)
            },
            threeStars: {
                count: businessUnit.numberOfReviews.threeStars,
                percentage: ((businessUnit.numberOfReviews.threeStars / totalReviews) * 100).toFixed(1)
            },
            fourStars: {
                count: businessUnit.numberOfReviews.fourStars,
                percentage: ((businessUnit.numberOfReviews.fourStars / totalReviews) * 100).toFixed(1)
            },
            fiveStars: {
                count: businessUnit.numberOfReviews.fiveStars,
                percentage: ((businessUnit.numberOfReviews.fiveStars / totalReviews) * 100).toFixed(1)
            }
        };

        // Prepare response data
        const responseData = {
            reviews: processedReviews,
            pagination: {
                total: response.data.total,
                page: pageNumber,
                per_page: perPage
            },
            overallStats: {
                averageRating: scoreStars,
                trustScore: trustScore,
                totalReviews: totalReviews,
                ratingDistribution: starDistribution,
                scoreBreakdown: {
                    stars: scoreStars,
                    trustScore: trustScore,
                    ratingCategory: scoreStars < 2 ? 'poor' : 
                                  scoreStars >= 2 && scoreStars < 4 ? 'Good' :
                                  scoreStars >= 4 && scoreStars < 5 ? 'Excellent' : 'Outstanding',
                    showRatingBanner: scoreStars >= 2.5
                }
            },
            showRatingBanner: scoreStars >= 2.5
        };

        return successResponse(res, responseData, 'Successfully retrieved reviews');
    } catch (error) {
        console.error('Error fetching Trustpilot reviews:', error);
        return errorResponse(res, error, error.message || 'Failed to fetch reviews');
    }
};



/**
 * Get Trustpilot product reviews
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getTrustpilotReviewSummaries = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            per_page = 10
        } = req.query;
        
        // Get access token and business unit ID
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);

        // Log the API request
        logger.info({
            type: 'trustpilot_api_request',
            endpoint: 'getReviewSummaries',
            businessUnitId,
            requestDetails: {
                page,
                per_page,
                timestamp: new Date().toISOString()
            }
        });

        // Get review summaries from Trustpilot API
        const response = await axios.get(
            `https://api.trustpilot.com/v1/private/product-reviews/business-units/${businessUnitId}/summaries`,
            {
                params: {
                    page,
                    perPage: per_page
                },
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        // Log the API response
        logger.info({
            type: 'trustpilot_api_response',
            endpoint: 'getReviewSummaries',
            responseData: {
                totalSummaries: response.data.summaries?.length || 0,
                page,
                per_page,
                timestamp: new Date().toISOString()
            }
        });

        // If no summaries found, return empty response
        if (!response.data.summaries || response.data.summaries.length === 0) {
            return successResponse(res, {
                summaries: [],
                pagination: {
                    total: 0,
                    page: parseInt(page),
                    per_page: parseInt(per_page)
                }
            }, 'No review summaries found');
        }

        // Process review summaries
        const processedSummaries = response.data.summaries.map(summary => ({
            id: summary.id,
            name: summary.name,
            sku: summary.sku,
            brand: summary.brand,
            numberOfReviews: {
                total: summary.numberOfReviews?.total || 0,
                oneStar: summary.numberOfReviews?.oneStar || 0,
                twoStars: summary.numberOfReviews?.twoStars || 0,
                threeStars: summary.numberOfReviews?.threeStars || 0,
                fourStars: summary.numberOfReviews?.fourStars || 0,
                fiveStars: summary.numberOfReviews?.fiveStars || 0
            },
            score: {
                stars: summary.score?.stars || 0,
                trustScore: summary.score?.trustScore || 0
            }
        }));

        return successResponse(res, {
            summaries: processedSummaries,
            pagination: {
                total: response.data.total || 0,
                page: parseInt(page),
                per_page: parseInt(per_page)
            }
        }, 'Successfully retrieved review summaries');

    } catch (error) {
        // Log error
        logger.error({
            type: 'trustpilot_api_error',
            endpoint: 'getReviewSummaries',
            error: error.message,
            stack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            timestamp: new Date().toISOString()
        });

        // Handle specific error cases
        if (error.response) {
            switch (error.response.status) {
                case 404:
                    return successResponse(res, {
                        summaries: [],
                        pagination: {
                            total: 0,
                            page: parseInt(req.query.page || 1),
                            per_page: parseInt(req.query.per_page || 10)
                        }
                    }, 'No review summaries found');
                case 401:
                    return errorResponse(res, { message: 'Invalid Trustpilot API credentials' }, 'Authentication failed', 401);
                case 403:
                    return errorResponse(res, { message: 'Access to review summaries is forbidden' }, 'Access forbidden', 403);
                case 400:
                    return errorResponse(res, error.response.data || { message: 'Bad request' }, 'Bad request', 400);
                default:
                    return errorResponse(res, error.response.data || error.message, 'Failed to fetch review summaries', error.response.status);
            }
        }

        return errorResponse(res, error, error.message || 'Failed to fetch review summaries');
    }
};

module.exports.getTrustpilotProductReviews = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            per_page = 10,
            sku,
            productUrl,
            language,
            stars,
            locale,
            attributeIds,
            hasAttachments,
            sort = 'desc'
        } = req.query;
        
        // Get access token and business unit ID
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);

        // Log the API request
        logger.info({
            type: 'trustpilot_api_request',
            endpoint: 'getProductReviews',
            businessUnitId,
            requestDetails: {
                page,
                per_page,
                sku,
                productUrl,
                language,
                stars,
                locale,
                attributeIds,
                hasAttachments,
                timestamp: new Date().toISOString()
            }
        });

        // Build query parameters
        const queryParams = {
            page,
            perPage: per_page
        };

        // Add optional parameters if provided
        if (sku) {
            try {
                const skuArray = JSON.parse(sku);
                // queryParams['sku[]'] = Array.isArray(skuArray) ? skuArray : [sku];
                queryParams['sku'] = sku;
            } catch (e) {
                // queryParams['sku[]'] = [sku];
                queryParams['sku'] = sku;
            }
        }
        // Get reviews from Trustpilot API
        const response = await axios.get(
            `https://api.trustpilot.com/v1/product-reviews/business-units/${businessUnitId}/reviews`,
            {
                params: queryParams,
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        // Check if we have productReviews in the response
        if (!response.data || !response.data.productReviews || !Array.isArray(response.data.productReviews)) {
            return successResponse(res, {
                reviews: [],
                pagination: {
                    total: 0,
                    page: parseInt(page),
                    per_page: parseInt(per_page)
                }
            }, 'No product reviews found');
        }


        // Process reviews
        const processedReviews = response.data.productReviews
            .map(review => ({
                id: review.id,
                stars: review.stars,
                title: review.title,
                text: review.content,
                createdAt: review.createdAt,
                consumer: {
                    displayName: review.consumer?.displayName
                },
                language: review.language,
                locale: review.locale,
                hasAttachments: review.attachments?.length > 0,
                attributes: review.attributeRatings || []
            }))
            .sort((a, b) => {
                const starA = Number(a.stars ?? 0);
                const starB = Number(b.stars ?? 0);
                return sort === 'asc' ? starA - starB : starB - starA;
            });

        return successResponse(res, {
            reviews: processedReviews,
            pagination: {
                total: response.data.productReviews.length || 0,
                page: parseInt(page),
                per_page: parseInt(per_page)
            }
        }, 'Successfully retrieved product reviews');

    } catch (error) {
        // Log error
        logger.error({
            type: 'trustpilot_api_error',
            endpoint: 'getProductReviews',
            error: error.message,
            stack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            timestamp: new Date().toISOString()
        });

        // Handle specific error cases
        if (error.response) {
            switch (error.response.status) {
                case 404:
                    return successResponse(res, {
                        reviews: [],
                        pagination: {
                            total: 0,
                            page: parseInt(req.query.page || 1),
                            per_page: parseInt(req.query.per_page || 10)
                        }
                    }, 'No product reviews found');
                case 401:
                    return errorResponse(res, { message: 'Invalid Trustpilot API credentials' }, 'Authentication failed', 401);
                case 403:
                    return errorResponse(res, { message: 'Access to product reviews is forbidden' }, 'Access forbidden', 403);
                case 400:
                    return errorResponse(res, error.response.data || { message: 'Bad request' }, 'Bad request', 400);
                default:
                    return errorResponse(res, error.response.data || error.message, 'Failed to fetch product reviews', error.response.status);
            }
        }

        return errorResponse(res, error, error.message || 'Failed to fetch product reviews');
    }
};

/**
 * Get active welcome content for homepage (cached)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getWelcomeContent = async (req, res, next) => {
    try {
        const data = await cacheOrFetch('welcome:content:active', async () => {
            const welcomeContent = await WelcomeContent.findOne({
                where: { status: 'active' },
                include: [
                    {
                        model: User,
                        as: 'updater',
                        attributes: ['id', 'first_name', 'last_name', 'email'],
                        required: false
                    }
                ]
            });
            return { welcomeContent: welcomeContent ? welcomeContent.toJSON() : null };
        }, 300);

        if (!data.welcomeContent) {
            return errorResponse(res, { message: 'No active welcome content found' }, 'No active welcome content found', 404);
        }

        return successResponse(res, { welcomeContent: data.welcomeContent }, 'Welcome content retrieved successfully');
    } catch (error) {
        console.error('Error in getWelcomeContent:', error);
        return errorResponse(res, error, error.message || 'Failed to retrieve welcome content');
    }
};

/**
 * Get active feature content for homepage
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getFeatureContent = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const totalCount = await FeatureContent.count({
            where: { status: 'active' }
        });

        // Calculate pagination details
        const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 1;
        const currentPage = page;

        const featureContent = await FeatureContent.findAll({
            where: { status: 'active' },
            include: [
                {
                    model: User,
                    as: 'updater',
                    attributes: ['id', 'first_name', 'last_name', 'email'],
                    required: false
                },
                {
                    model: FeatureContentIcon,
                    as: 'icon',
                    attributes: ['id', 'icon_url', 'file_name'],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: offset
        });

        if (!featureContent || featureContent.length === 0) {
            return errorResponse(res, { message: 'No active feature content found' }, 'No active feature content found', 404);
        }

        const pagination = {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: totalCount,
            itemsPerPage: limit,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1
        };

        return successResponse(res, { featureContent, pagination }, 'Feature content retrieved successfully');
    } catch (error) {
        console.error('Error in getFeatureContent:', error);
        return errorResponse(res, error, error.message || 'Failed to retrieve feature content');
    }
};

/**
 * Get SEO meta data by slug
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getSeoMetaBySlug = async (req, res, next) => {
    try {
        const { slug } = req.query;

        // Enhanced input validation
        if (!slug || typeof slug !== 'string') {
            return errorResponse(res, 
                { message: "Valid slug parameter is required" }, 
                "Invalid slug parameter", 
                400
            );
        }

        const trimmedSlug = slug.trim();
        if (!trimmedSlug) {
            return errorResponse(res, 
                { message: "Slug cannot be empty" }, 
                "Empty slug provided", 
                400
            );
        }

        // Step 1: Find slug relation
        const slugRelation = await SlugRelation.findOne({
            where: { slug: trimmedSlug },
            attributes: ['slug', 'entity_type', 'entity_id']
        });

        if (!slugRelation) {
            return errorResponse(res, 
                { message: "Slug not found" }, 
                "Slug not found", 
                404
            );
        }

        const { entity_type, entity_id } = slugRelation;
        let entityData = null;

        // Step 2: Try to get SEO data from SeoMeta table first
        const seoData = await SeoMeta.findOne({
            where: {
                entityType: entity_type,
                entityId: entity_id.toString() // Convert to string for UUID comparison
            },
            attributes: ['id', 'entityType', 'entityId', 'title', 'description', 'description_text', 'focusKeyword', 'slug', 'canonicalUrl', 'ogImage', 'noIndex']
        });

        if (seoData) {
            // Use SEO data if available
            entityData = {
                entity_type: seoData.entityType,
                entity_id: seoData.entityId,
                name: seoData.title || 'Untitled',
                description: seoData.description,
                logo_url: seoData.ogImage
            };
        } else {
            // Step 3: Check if dynamic SEO is enabled (defaults to false if not set)
            const dynamicSeoEnabled = process.env.DYNAMIC_SEO === 'true';
            
            if (dynamicSeoEnabled) {
                // Use fallback to direct entity data fetching
                entityData = await getEntityDataByType(entity_type, entity_id);
                
                if (!entityData) {
                    return errorResponse(res, 
                        { message: `Entity not found for slug: ${trimmedSlug}` }, 
                        "Entity not found", 
                        404
                    );
                }
            } else {
                // Dynamic SEO disabled - return error if no SEO data found
                return errorResponse(res, 
                    { message: `SEO data not found for entity type: ${entity_type} with ID: ${entity_id}. Dynamic SEO is disabled.` }, 
                    "SEO data not found", 
                    404
                );
            }
        }

        return successResponse(res, {
            slug: trimmedSlug,
            ...entityData
        }, 'SEO meta data retrieved successfully');

    } catch (error) {
        logger.error('Error in getSeoMetaBySlug:', {
            error: error.message,
            stack: error.stack,
            slug: req.query?.slug,
            timestamp: new Date().toISOString()
        });
        return errorResponse(res, error, error.message || 'Failed to retrieve SEO meta data');
    }
};

/**
 * Remove HTML tags and clean formatting from text content, optimized for SEO
 * @param {string} text - Text content that may contain HTML and formatting
 * @param {number} maxLength - Maximum character length (default: 160 for SEO)
 * @returns {string|null} Clean text without HTML tags and formatting or null if input is null/undefined
 */
const removeHtmlTags = (text, maxLength) => {
    if (!text) return null;
    
    // Remove HTML tags
    let cleanText = text.replace(/<[^>]*>/g, '');
    
    // Replace multiple newlines with single space
    cleanText = cleanText.replace(/\n+/g, ' ');
    
    // Replace multiple spaces with single space
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    // Trim whitespace
    cleanText = cleanText.trim();
    
    // Truncate to SEO-optimal length (160 characters)
    if (cleanText && cleanText.length > maxLength) {
        cleanText = cleanText.substring(0, maxLength).trim();
        // Ensure we don't cut words in the middle - find last space
        const lastSpace = cleanText.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.8) { // Only if we're not cutting too much
            cleanText = cleanText.substring(0, lastSpace);
        }
        cleanText += '...';
    }
    
    return cleanText || null;
};

/**
 * Fetch entity data based on entity_type (Fallback method)
 * @param {string} entity_type - The type of entity
 * @param {number} entity_id - The ID of the entity
 * @returns {Object|null} Entity data or null if not found
 */
const getEntityDataByType = async (entity_type, entity_id) => {
    let entityData = null;

    try {
        switch (entity_type) {
            case 'category':
                const category = await Category.findByPk(entity_id, {
                    attributes: ['id', 'name', 'description', 'logo_url']
                });
                if (category) {
                    entityData = {
                        entity_type: 'category',
                        entity_id: category.id,
                        name: category.name,
                        description: removeHtmlTags(category.description),
                        logo_url: category.logo_url
                    };
                }
                break;

            case 'brand':
                const brand = await Brand.findByPk(entity_id, {
                    attributes: ['id', 'name', 'description', 'logo_url']
                });
                if (brand) {
                    entityData = {
                        entity_type: 'brand',
                        entity_id: brand.id,
                        name: brand.name,
                        description: removeHtmlTags(brand.description),
                        logo_url: brand.logo_url
                    };
                }
                break;

            case 'product':
                const product = await Product.findByPk(entity_id, {
                    attributes: ['id', 'name', 'description'],
                    include: [{
                        model: ProductImage,
                        as: 'ProductImages',
                        where: { is_primary: true },
                        attributes: ['image_url'],
                        required: false
                    }]
                });
                if (product) {
                    entityData = {
                        entity_type: 'product',
                        entity_id: product.id,
                        name: product.name,
                        description: removeHtmlTags(product.description),
                        logo_url: product.ProductImages && product.ProductImages.length > 0 
                            ? product.ProductImages[0].image_url 
                            : null
                    };
                }
                break;

            case 'product_variant':
                const productVariant = await ProductVariant.findByPk(entity_id, {
                    attributes: ['id', 'product_id', 'description', 'slug'],
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name', 'description'],
                        include: [{
                            model: ProductImage,
                            as: 'ProductImages',
                            where: { is_primary: true },
                            attributes: ['image_url'],
                            required: false
                        }]
                    }]
                });
                if (productVariant && productVariant.product) {
                    // Use variant description or product name
                    const variantDescription = productVariant.description || productVariant.product.description;
                    const cleanDescription = removeHtmlTags(variantDescription);
                    
                    entityData = {
                        entity_type: 'product_variant',
                        entity_id: productVariant.id,
                        name: productVariant.product.name,
                        description: cleanDescription,
                        logo_url: productVariant.product.ProductImages && productVariant.product.ProductImages.length > 0 
                            ? productVariant.product.ProductImages[0].image_url 
                            : null
                    };
                }
                break;

            case 'deal':
                const deal = await Deal.findByPk(entity_id, {
                    attributes: ['id', 'name', 'deal_type', 'required_qty', 'get_qty', 'fixed_price', 'discount_percent', 'image_url', 'description']
                });
                if (deal) {
                    // Use saved description if available, otherwise generate from deal details
                    let description = deal.description || '';
                    if (!description) {
                        if (deal.fixed_price && deal.required_qty) {
                            description = `Get ${deal.required_qty} for £${deal.fixed_price}`;
                        } else if (deal.discount_percent) {
                            description = `Get ${deal.discount_percent}% off`;
                        } else if (deal.deal_type === 'buy_x_get_y' && deal.required_qty && deal.get_qty) {
                            description = `Buy ${deal.required_qty} get ${deal.get_qty} free`;
                        } else {
                            description = `Special deal: ${deal.name}`;
                        }
                    }
                    
                    entityData = {
                        entity_type: 'deal',
                        entity_id: deal.id,
                        name: deal.name,
                        description: description,
                        logo_url: deal.image_url
                    };
                }
                break;

            case 'blog':
            case 'blog_category':
                const blog = await require('../../../models').Blog.findByPk(entity_id, {
                    attributes: ['id', 'title', 'content', 'image_url']
                });
                if (blog) {
                    // Use content as description, removing HTML tags and limiting to 160 chars for SEO
                    const description = removeHtmlTags(blog.content, 160);
                    
                    entityData = {
                        entity_type: entity_type,
                        entity_id: blog.id,
                        name: blog.title,
                        description: description,
                        logo_url: blog.image_url
                    };
                }
                break;

            default:
                logger.warn(`Unsupported entity type: ${entity_type} for entity_id: ${entity_id}`);
                return null;
        }

        return entityData;

    } catch (error) {
        logger.error(`Error fetching entity data for ${entity_type}:${entity_id}:`, error);
        return null;
    }
};

/**
 * Get slugs for specific entities by name search
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getEntitySlugs = async (req, res, next) => {
    try {
        // Define the entity names we want to find
        const targetEntities = ['NIC SALTS', 'REFILLABLE POD KITS' , 'POD KITS'];
        
        // First, find the entities by name (MySQL compatible)
        const entities = await Category.findAll({
            where: {
                name: {
                    [Op.or]: targetEntities.map(name => ({
                        [Op.like]: `%${name}%`
                    }))
                }
            },
            attributes: ['id', 'name', 'slug']
        });

        if (!entities || entities.length === 0) {
            return errorResponse(res, { message: 'No matching entities found' }, 'No matching entities found', 404);
        }

        // Get the entity IDs
        const entityIds = entities.map(entity => entity.id);

        // Find slug relations for these entities
        const slugRelations = await SlugRelation.findAll({
            where: {
                entity_type: 'category',
                entity_id: {
                    [Op.in]: entityIds
                }
            },
            attributes: ['slug', 'entity_id']
        });

        // Map the results
        const result = entities.map(entity => {
            const slugRelation = slugRelations.find(sr => sr.entity_id === entity.id);
            
            // Determine the flag based on entity name
            let flag = null;
            if (entity.name.toLowerCase().includes('REFILLABLE POD KITS')) {
                flag = 'REFILLABLE POD KITS';
            } else if (entity.name.toLowerCase().includes('NIC SALTS')) {
                flag = 'NIC SALTS';
            }else if (entity.name.toLowerCase().includes('POD KITS')) {
                flag = 'POD KITS';
            }
            
            return {
                entity_id: entity.id,
                entity_name: entity.name,
                entity_slug: entity.slug,
                slug_relation: slugRelation ? slugRelation.slug : null,
                flag: flag
            };
        });
        return successResponse(res, { 
            entities: result,
            total_found: result.length
        }, 'Entity slugs retrieved successfully');

    } catch (error) {
        console.error('Error in getEntitySlugs:', error);
        return errorResponse(res, error, error.message || 'Failed to retrieve entity slugs');
    }
};