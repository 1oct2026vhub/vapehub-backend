const { Brand, Category, Product, Blog, Deal } = require('../../../../models');

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
 * Get all published products under a category or brand, sorted alphabetically by name
 * @param {string} entityType - Type of entity ('category' or 'brand')
 * @param {number} entityId - ID of the category or brand
 * @returns {Promise<Array>} Array of products
 */
const getPublishedProductsByEntity = async (entityType, entityId) => {
    const db = require('../../../../models');
    const { Category, Brand } = db;
    
    if (entityType === 'category') {
        // Fetch products via Category association
        return Product.findAll({
            where: {
                status: 'published',
                deletedAt: null
            },
            include: [{
                model: Category,
                as: 'Categories',
                where: { id: Number(entityId) },
                attributes: [],
                through: { attributes: [] }
            }],
            attributes: ['id', 'name', 'slug'],
            order: [['name', 'ASC']]
        });
    }
    
    if (entityType === 'brand') {
        // Fetch products via Brand association
        return Product.findAll({
            where: {
                status: 'published',
                deletedAt: null
            },
            include: [{
                model: Brand,
                as: 'Brands',
                where: { id: Number(entityId) },
                attributes: [],
                through: { attributes: [] }
            }],
            attributes: ['id', 'name', 'slug'],
            order: [['name', 'ASC']]
        });
    }
    
    return [];
};

/**
 * Group products by their first alphabet letter (A-Z)
 * @param {Array} products - Array of product objects with 'name' property
 * @returns {Map} Map where key is the letter (A-Z) and value is array of products
 */
const groupProductsByAlphabet = (products) => {
    const grouped = new Map();
    
    for (const product of products) {
        const productName = (product.name || '').trim();
        if (!productName) continue;
        
        const firstLetter = productName.charAt(0).toUpperCase();
        // Only include A-Z letters
        if (!firstLetter.match(/[A-Z]/)) continue;
        
        if (!grouped.has(firstLetter)) {
            grouped.set(firstLetter, []);
        }
        grouped.get(firstLetter).push(product);
    }
    
    return grouped;
};

module.exports = {
    getEntitySlug,
    getPublishedProductsByEntity,
    groupProductsByAlphabet
}; 