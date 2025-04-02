const { Brand, Category, Product, Blog } = require('../../../../models');

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

module.exports = {
    getEntitySlug
}; 