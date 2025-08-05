const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Menu, MenuItem, Product, Brand, Blog, Category, Deal, sequelize, ProductImage } = require("../../../models");
const logger = require("../../../library/logger");
const { Op } = require("sequelize");
const { getNewProducts, getHotProducts, getProductsByEntity, isProductNew, isProductHot } = require("../helper/menu.helper");

module.exports = {

    // Get all menus
    getMenus: async (req, res) => {
        try {
            const where = {};
            const filters = req.query;
            
            if (filters.status !== undefined) {
                where.status = filters.status;
            }
            if (filters.entity_type) {
                where.entity_type = filters.entity_type;
            }
            if (filters.label) {
                where.label = { [Op.like]: `%${filters.label}%` };
            }
            // First get all menus with their children
            const menus = await Menu.findAll({
                where,
                order: [['order', 'ASC']],
                include: [
                    {
                        model: Menu,
                        as: 'parent',
                        attributes: ['id', 'label', 'original']
                    },
                    {
                        model: Menu,
                        as: 'children',
                        attributes: ['id', 'label', 'order', 'original', 'status', 'entity_type', 'entity_id']
                    }
                ]
            });
            // Convert to tree structure
            const menuTree = buildMenuTree(menus.map(menu => menu.toJSON()));
            // Function to process menu items recursively
            const processMenuItems = async (items) => {
                for (const item of items) {
                    if (item.entity_type && item.entity_id) {
                        const baseAttributes = ['id', 'name', 'slug'];
                        const imageAttributes = ['logo_url', 'image_url'];
                        
                        // Determine which attributes to fetch based on show_image
                        const attributes = item.show_image === 1 
                            ? [...baseAttributes, ...imageAttributes]
                            : baseAttributes;

                        try {
                            switch (item.entity_type) {
                                case 'brand':
                                    const brand = await Brand.findByPk(item.entity_id, {
                                        attributes: attributes
                                    });
                                    item.entity_data = brand;
                                    break;
                                case 'category':
                                    const category = await Category.findByPk(item.entity_id, {
                                        attributes: attributes
                                    });
                                    item.entity_data = category;
                                    break;
                                case 'product':
                                    const product = await Product.findByPk(item.entity_id, {
                                        attributes: [...baseAttributes, 'price', 'discount_price'],
                                        include: [{
                                            model: ProductImage,
                                            as: 'ProductImages',
                                            where: { is_primary: true },
                                            attributes: ['image_url'],
                                            required: false
                                        }]
                                    });
                                    if (product && product.ProductImages && product.ProductImages.length > 0) {
                                        product.image_url = product.ProductImages[0].image_url;
                                    }
                                    item.entity_data = product;
                                    break;
                                case 'blog':
                                    const blog = await Blog.findByPk(item.entity_id, {
                                        attributes: attributes
                                    });
                                    item.entity_data = blog;
                                    break;
                                case 'deal':
                                    const deal = await Deal.findByPk(item.entity_id, {
                                        attributes: [...baseAttributes, 'deal_type', 'discount_percent', 'fixed_price', 'is_active', 'valid_from', 'valid_to'],
                                        include: [{
                                            model: Product,
                                            as: 'products',
                                            through: { attributes: [] }, // Don't include junction table attributes
                                            attributes: ['id', 'name', 'slug', 'price', 'discount_price'],
                                            include: [{
                                                model: ProductImage,
                                                as: 'ProductImages',
                                                where: { is_primary: true },
                                                attributes: ['image_url'],
                                                required: false
                                            }]
                                        }]
                                    });
                                    
                                    // Add primary product image to deal if products exist
                                    if (deal && deal.products && deal.products.length > 0) {
                                        const primaryProduct = deal.products[0];
                                        if (primaryProduct.ProductImages && primaryProduct.ProductImages.length > 0) {
                                            deal.image_url = primaryProduct.ProductImages[0].image_url;
                                        }
                                    }
                                    
                                    item.entity_data = deal;
                                    break;
                            }
                        } catch (error) {
                            logger.error(`Error fetching ${item.entity_type} data:`, error);
                            item.entity_data = null;
                        }
                    }

                    // Handle new and hot products for menu items
                    // Check if the specific product in entity_data is new or hot
                    let isNew = false;
                    let isHot = false;
                    
                    if (item.entity_type === 'product' && item.entity_data && item.entity_data.id) {
                        try {
                            isNew = await isProductNew(item.entity_data.id);
                        } catch (error) {
                            logger.error('Error checking if product is new:', error);
                        }

                        try {
                            isHot = await isProductHot(item.entity_data.id);
                        } catch (error) {
                            logger.error('Error checking if product is hot:', error);
                        }
                    }
                    
                    // Add is_new and is_hot flags to menu items
                    item.is_new = isNew;
                    item.is_hot = isHot;

                    // Handle products based on entity type for mega menu
                    if (item.entity_type && item.entity_id && ['category', 'brand', 'deal'].includes(item.entity_type)) {
                        try {
                            item.related_products = await getProductsByEntity(item.entity_type, item.entity_id, 10);
                        } catch (error) {
                            logger.error(`Error fetching products for ${item.entity_type}:`, error);
                            item.related_products = [];
                        }
                    }

                    if (item.children && item.children.length > 0) {
                        // Process children with show_image check
                        for (const child of item.children) {
                            if (child.show_image == 1) {
                                const baseAttributes = ['id', 'name', 'slug'];
                                
                                try {
                                    switch (child.entity_type) {
                                        case 'brand':
                                            const brand = await Brand.findByPk(child.entity_id, {
                                                attributes: [...baseAttributes, 'logo_url']
                                            });
                                            child.entity_data = brand;
                                            break;
                                        case 'category':
                                            const category = await Category.findByPk(child.entity_id, {
                                                attributes: [...baseAttributes, 'logo_url']
                                            });
                                            child.entity_data = category;
                                            break;
                                        case 'product':
                                            const product = await Product.findByPk(child.entity_id, {
                                                attributes: [...baseAttributes, 'price', 'discount_price'],
                                                include: [{
                                                    model: ProductImage,
                                                    as: 'ProductImages',
                                                    where: { is_primary: true },
                                                    attributes: ['image_url'],
                                                    required: false
                                                }]
                                            });
                                            if (product && product.ProductImages && product.ProductImages.length > 0) {
                                                product.image_url = product.ProductImages[0].image_url;
                                            }
                                            child.entity_data = product;
                                            break;
                                        case 'blog':
                                            const blog = await Blog.findByPk(child.entity_id, {
                                                attributes: [...baseAttributes, 'image_url']
                                            });
                                            child.entity_data = blog;
                                            break;
                                        case 'deal':
                                            const deal = await Deal.findByPk(child.entity_id, {
                                                attributes: [...baseAttributes, 'deal_type', 'discount_percent', 'fixed_price', 'is_active'],
                                                include: [{
                                                    model: Product,
                                                    as: 'products',
                                                    through: { attributes: [] },
                                                    attributes: ['id', 'name', 'slug'],
                                                    include: [{
                                                        model: ProductImage,
                                                        as: 'ProductImages',
                                                        where: { is_primary: true },
                                                        attributes: ['image_url'],
                                                        required: false
                                                    }]
                                                }]
                                            });
                                            
                                            // Add primary product image to deal if products exist
                                            if (deal && deal.products && deal.products.length > 0) {
                                                const primaryProduct = deal.products[0];
                                                if (primaryProduct.ProductImages && primaryProduct.ProductImages.length > 0) {
                                                    deal.image_url = primaryProduct.ProductImages[0].image_url;
                                                }
                                            }
                                            
                                            child.entity_data = deal;
                                            break;
                                    }
                                } catch (error) {
                                    logger.error(`Error fetching ${child.entity_type} data:`, error);
                                    child.entity_data = null;
                                }
                            } else {
                                // For children with show_image !== 1, only fetch base attributes
                                try {
                                    switch (child.entity_type) {
                                        case 'brand':
                                        case 'category':
                                        case 'blog':
                                            const entity = await Brand.findByPk(child.entity_id, {
                                                attributes: ['id', 'name', 'slug']
                                            });
                                            child.entity_data = entity;
                                            break;
                                        case 'product':
                                            const product = await Product.findByPk(child.entity_id, {
                                                attributes: ['id', 'name', 'slug', 'price', 'discount_price']
                                            });
                                            child.entity_data = product;
                                            break;
                                        case 'deal':
                                            const deal = await Deal.findByPk(child.entity_id, {
                                                attributes: ['id', 'name', 'slug', 'deal_type', 'discount_percent', 'fixed_price', 'is_active']
                                            });
                                            child.entity_data = deal;
                                            break;
                                    }
                                } catch (error) {
                                    logger.error(`Error fetching ${child.entity_type} data:`, error);
                                    child.entity_data = null;
                                }
                            }

                            // Handle new and hot products for child menu items
                            let isChildNew = false;
                            let isChildHot = false;
                            
                            if (child.entity_type === 'product' && child.entity_data && child.entity_data.id) {
                                try {
                                    isChildNew = await isProductNew(child.entity_data.id);
                                } catch (error) {
                                    logger.error('Error checking if child product is new:', error);
                                }

                                try {
                                    isChildHot = await isProductHot(child.entity_data.id);
                                } catch (error) {
                                    logger.error('Error checking if child product is hot:', error);
                                }
                            }
                            
                            // Add is_new and is_hot flags to child menu items
                            child.is_new = isChildNew;
                            child.is_hot = isChildHot;

                            // Handle products based on entity type for child menu items
                            if (child.entity_type && child.entity_id && ['category', 'brand', 'deal'].includes(child.entity_type)) {
                                try {
                                    child.related_products = await getProductsByEntity(child.entity_type, child.entity_id, 10);
                                } catch (error) {
                                    logger.error(`Error fetching products for child ${child.entity_type}:`, error);
                                    child.related_products = [];
                                }
                            }
                        }
                    }
                }
            };
            // Process all menu items
            await processMenuItems(menuTree);
            
            return successResponse(res, { data: menuTree }, 'Success');
        } catch (error) {
            logger.error('Error fetching menus:', error);
            return errorResponse(res, error);
        }
    },
}; 

const buildMenuTree = (menus, parentId = null) => {
    const tree = [];
    
    for (const menu of menus) {
        if (menu.menu_parent === parentId) {
            const children = buildMenuTree(menus, menu.id);
            if (children.length) {
                menu.children = children;
            }
            tree.push(menu);
        }
    }
    
    return tree;
};