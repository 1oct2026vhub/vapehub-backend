const { Menu, MenuItem } = require("../../../models");
const logger = require("../../../library/logger");
const { Brand, Category, Product, Blog, Deal, OrderItem, Order, sequelize } = require('../../../models');
const { Op } = require('sequelize');
const { cacheOrFetch } = require('../../../library/cache');

/**
 * Validate menu items structure
 * @param {Array} items - Array of menu items to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const validateMenuItems = (items) => {
    if (!Array.isArray(items)) return false;
    
    return items.every(item => {
        return (
            typeof item.title === 'string' &&
            typeof item.url === 'string' &&
            typeof item.order === 'number' &&
            typeof item.is_active === 'boolean'
        );
    });
};

/**
 * Sort menu items by order
 * @param {Array} items - Array of menu items to sort
 * @returns {Array} - Sorted array of menu items
 */
const sortMenuItems = (items) => {
    return items.sort((a, b) => a.order - b.order);
};

/**
 * Get active menu items
 * @param {number} menuId - ID of the menu
 * @returns {Promise<Array>} - Array of active menu items
 */
const getActiveMenuItems = async (menuId) => {
    try {
        const items = await MenuItem.findAll({
            where: {
                menu_id: menuId,
                is_active: true
            },
            order: [['order', 'ASC']]
        });
        return items;
    } catch (error) {
        logger.error('Error getting active menu items:', error);
        throw error;
    }
};

/**
 * Check if menu name is unique
 * @param {string} name - Menu name to check
 * @param {number} [excludeId] - ID to exclude from check (for updates)
 * @returns {Promise<boolean>} - True if name is unique
 */
const isMenuNameUnique = async (name, excludeId = null) => {
    try {
        const whereClause = {
            name: name
        };
        
        if (excludeId) {
            whereClause.id = { [sequelize.Op.ne]: excludeId };
        }

        const existingMenu = await Menu.findOne({ where: whereClause });
        return !existingMenu;
    } catch (error) {
        logger.error('Error checking menu name uniqueness:', error);
        throw error;
    }
};

const getEntitySlug = async (entityType, entityId, original = null) => {
    let entity;
    
    switch (entityType) {
        case 'brand':
            entity = await Brand.findByPk(entityId);
            break;
        case 'category':
            entity = await Category.findByPk(entityId);
            break;
        case 'product':
            entity = await Product.findByPk(entityId);
            break;
        case 'blog':
            entity = await Blog.findByPk(entityId);
            break;
        case 'deal':
            entity = await Deal.findByPk(entityId);
            break;
        case 'page':
            entity = { slug: original };
            break;
        default:
            throw new Error('Invalid entity type');
    }

    if (!entity) {
        throw new Error(`${entityType} with id ${entityId} not found`);
    }

    return entity.slug || original || `#`;
};

/**
 * Get new products (latest within 28 days) for a specific entity
 * @param {string} entityType - Type of entity (category, brand, deal)
 * @param {number} entityId - ID of the entity
 * @param {number} limit - Number of products to return
 * @returns {Array} Array of new products
 */
const getNewProducts = async (entityType, entityId, limit = 10) => {
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

    const newInWindow = {
        [Op.or]: [
            { new_in_at: { [Op.gte]: twentyEightDaysAgo } },
            {
                new_in_at: null,
                createdAt: { [Op.gte]: twentyEightDaysAgo }
            }
        ]
    };

    let products = [];

    switch (entityType) {
        case 'category':
            products = await Product.findAll({
                where: {
                    category_id: entityId,
                    status: 'published',
                    is_coming_soon: false,
                    ...newInWindow
                },
                attributes: ['id', 'name', 'slug', 'price', 'discount_price', 'new_in_at', 'createdAt'],
                include: [{
                    model: require('../../../models').ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    attributes: ['image_url'],
                    required: false
                }],
                order: [[sequelize.literal('COALESCE(new_in_at, createdAt)'), 'DESC']],
                limit: limit
            });
            break;

        case 'brand':
            products = await Product.findAll({
                include: [{
                    model: require('../../../models').ProductBrand,
                    as: 'ProductBrands',
                    where: { brand_id: entityId },
                    attributes: []
                }, {
                    model: require('../../../models').ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    attributes: ['image_url'],
                    required: false
                }],
                where: {
                    status: 'published',
                    is_coming_soon: false,
                    ...newInWindow
                },
                attributes: ['id', 'name', 'slug', 'price', 'discount_price', 'new_in_at', 'createdAt'],
                order: [[sequelize.literal('COALESCE(new_in_at, createdAt)'), 'DESC']],
                limit: limit
            });
            break;

        case 'deal':
            products = await Product.findAll({
                include: [{
                    model: require('../../../models').DealProduct,
                    as: 'deals',
                    where: { deal_id: entityId },
                    attributes: []
                }, {
                    model: require('../../../models').ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    attributes: ['image_url'],
                    required: false
                }],
                where: {
                    status: 'published',
                    is_coming_soon: false,
                    ...newInWindow
                },
                attributes: ['id', 'name', 'slug', 'price', 'discount_price', 'new_in_at', 'createdAt'],
                order: [[sequelize.literal('COALESCE(new_in_at, createdAt)'), 'DESC']],
                limit: limit
            });
            break;

        default:
            // If no specific entity, get all new products
            products = await Product.findAll({
                where: {
                    status: 'published',
                    is_coming_soon: false,
                    ...newInWindow
                },
                attributes: ['id', 'name', 'slug', 'price', 'discount_price', 'new_in_at', 'createdAt'],
                include: [{
                    model: require('../../../models').ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    attributes: ['image_url'],
                    required: false
                }],
                order: [[sequelize.literal('COALESCE(new_in_at, createdAt)'), 'DESC']],
                limit: limit
            });
    }

    return products.map(product => {
        if (product.ProductImages && product.ProductImages.length > 0) {
            product.image_url = product.ProductImages[0].image_url;
        }
        return product;
    });
};

/**
 * Get hot products (top 10 most sold within 28 days) for a specific entity
 * @param {string} entityType - Type of entity (category, brand, deal)
 * @param {number} entityId - ID of the entity
 * @param {number} limit - Number of products to return
 * @returns {Array} Array of hot products
 */
const getHotProducts = async (entityType, entityId, limit = 10) => {
    const cacheKey = `menu:hot-products:${entityType}:${entityId}:${limit}`;
    return cacheOrFetch(cacheKey, async () => {
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

        let whereClause = 'p.status = "published"';
        let joinClause = '';

        switch (entityType) {
            case 'category':
                whereClause += ' AND p.category_id = :entityId';
                break;
            case 'brand':
                joinClause = 'INNER JOIN product_brands pb ON p.id = pb.product_id AND pb.brand_id = :entityId';
                break;
            case 'deal':
                joinClause = 'INNER JOIN deal_products dp ON p.id = dp.product_id AND dp.deal_id = :entityId';
                break;
        }

        const products = await sequelize.query(`
            SELECT 
                p.id,
                p.name,
                p.slug,
                p.price,
                p.discount_price,
                COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM products p
            ${joinClause}
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id 
                AND o.status IN ('completed', 'delivered')
                AND o.updatedAt >= :startDate
            WHERE ${whereClause}
            GROUP BY p.id, p.name, p.slug, p.price, p.discount_price
            HAVING total_sold > 0
            ORDER BY total_sold DESC
            LIMIT :limit
        `, {
            replacements: {
                startDate: twentyEightDaysAgo,
                entityId: entityId,
                limit: limit
            },
            type: sequelize.QueryTypes.SELECT
        });

        const productIds = products.map(p => p.id);
        const productImages = productIds.length > 0 ? await require('../../../models').ProductImage.findAll({
            where: {
                product_id: { [Op.in]: productIds },
                is_primary: true
            },
            attributes: ['product_id', 'image_url']
        }) : [];

        const imageMap = {};
        productImages.forEach(img => {
            imageMap[img.product_id] = img.image_url;
        });

        return products.map(product => ({
            ...product,
            image_url: imageMap[product.id] || null
        }));
    }, 300);
};

/**
 * Get products based on entity type and ID
 * @param {string} entityType - Type of entity (category, brand, deal)
 * @param {number} entityId - ID of the entity
 * @param {number} limit - Number of products to return
 * @returns {Array} Array of products
 */
const getProductsByEntity = async (entityType, entityId, limit = 10) => {
    let products = [];

    switch (entityType) {
        case 'category':
            products = await Product.findAll({
                where: {
                    category_id: entityId,
                    status: true
                },
                attributes: ['id', 'name', 'slug', 'price', 'discount_price'],
                include: [{
                    model: require('../../../models').ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    attributes: ['image_url'],
                    required: false
                }],
                order: [['createdAt', 'DESC']],
                limit: limit
            });
            break;

        case 'brand':
            products = await Product.findAll({
                include: [{
                    model: require('../../../models').ProductBrand,
                    as: 'ProductBrands',
                    where: { brand_id: entityId },
                    attributes: []
                }, {
                    model: require('../../../models').ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    attributes: ['image_url'],
                    required: false
                }],
                where: {
                    status: true
                },
                attributes: ['id', 'name', 'slug', 'price', 'discount_price'],
                order: [['createdAt', 'DESC']],
                limit: limit
            });
            break;

        case 'deal':
            // First check if the deal is active and not expired
            const deal = await require('../../../models').Deal.findOne({
                where: {
                    id: entityId,
                    is_active: true,
                    is_deleted: false,
                    valid_from: { [Op.lte]: new Date() },
                    valid_to: { [Op.gte]: new Date() }
                }
            });
            
            // Only fetch products if deal is active and not expired
            if (deal) {
                products = await Product.findAll({
                    include: [{
                        model: require('../../../models').DealProduct,
                        as: 'deals',
                        where: { deal_id: entityId },
                        attributes: []
                    }, {
                        model: require('../../../models').ProductImage,
                        as: 'ProductImages',
                        where: { is_primary: true },
                        attributes: ['image_url'],
                        required: false
                    }],
                    where: {
                        status: true
                    },
                    attributes: ['id', 'name', 'slug', 'price', 'discount_price'],
                    order: [['createdAt', 'DESC']],
                    limit: limit
                });
            }
            break;
    }

    return products.map(product => {
        if (product.ProductImages && product.ProductImages.length > 0) {
            product.image_url = product.ProductImages[0].image_url;
        }
        return product;
    });
};

/**
 * Check if a specific product is new (New In within 28 days)
 * @param {number} productId - ID of the product to check
 * @returns {boolean} True if product is new
 */
const isProductNew = async (productId) => {
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

    const product = await Product.findOne({
        where: {
            id: productId,
            status: 'published',
            is_coming_soon: false,
            [Op.or]: [
                { new_in_at: { [Op.gte]: twentyEightDaysAgo } },
                {
                    new_in_at: null,
                    createdAt: { [Op.gte]: twentyEightDaysAgo }
                }
            ]
        },
        attributes: ['id']
    });

    return !!product;
};

/**
 * Check if a specific product is hot (in top 10 most sold within 28 days)
 * @param {number} productId - ID of the product to check
 * @returns {boolean} True if product is hot
 */
const isProductHot = async (productId) => {
    const cacheKey = `menu:is-hot:${productId}`;
    return cacheOrFetch(cacheKey, async () => {
        const twentyEightDaysAgo = new Date();
        twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

        const result = await sequelize.query(`
            SELECT 
                p.id,
                COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id 
                AND o.status IN ('completed', 'delivered')
                AND o.updatedAt >= :startDate
            WHERE p.id = :productId AND p.status = 'published'
            GROUP BY p.id
        `, {
            replacements: {
                startDate: twentyEightDaysAgo,
                productId: productId
            },
            type: sequelize.QueryTypes.SELECT
        });

        if (result.length === 0 || result[0].total_sold === 0) {
            return false;
        }

        const topProducts = await sequelize.query(`
            SELECT 
                p.id,
                COALESCE(SUM(oi.quantity), 0) as total_sold
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id 
                AND o.status IN ('completed', 'delivered')
                AND o.updatedAt >= :startDate
            WHERE p.status = 'published'
            GROUP BY p.id, p.name, p.slug, p.price, p.discount_price
            HAVING total_sold > 0
            ORDER BY total_sold DESC
            LIMIT 10
        `, {
            replacements: {
                startDate: twentyEightDaysAgo
            },
            type: sequelize.QueryTypes.SELECT
        });

        const topProductIds = topProducts.map(p => p.id);
        return topProductIds.includes(productId);
    }, 300);
};

module.exports = {
    validateMenuItems,
    sortMenuItems,
    getActiveMenuItems,
    isMenuNameUnique,
    getEntitySlug,
    getNewProducts,
    getHotProducts,
    getProductsByEntity,
    isProductNew,
    isProductHot
}; 