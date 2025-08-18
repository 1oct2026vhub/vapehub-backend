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
                        
                        // Determine which attributes to fetch based on show_image and entity type
                        let attributes = baseAttributes;
                        if (item.show_image && item.show_image == 1) {
                            switch (item.entity_type) {
                                case 'brand':
                                case 'category':
                                    attributes = [...baseAttributes, 'logo_url'];
                                    break;
                                case 'blog':
                                    attributes = [...baseAttributes, 'image_url'];
                                    break;
                                case 'product':
                                case 'deal':
                                    // These will be handled separately with includes
                                    attributes = baseAttributes;
                                    break;
                            }
                        }

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
                                    const deal = await Deal.findOne({
                                        where: {
                                            id: item.entity_id,
                                            is_active: true,
                                            is_deleted: false,
                                            valid_from: { [Op.lte]: new Date() },
                                            valid_to: { [Op.gte]: new Date() }
                                        },
                                        attributes: [...baseAttributes, 'deal_type', 'discount_percent', 'fixed_price', 'is_active', 'valid_from', 'valid_to', 'image_url'],
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
                                    // Use deal's own image_url if available, otherwise fallback to primary product image
                                    if (deal && !deal.image_url && deal.products && deal.products.length > 0) {
                                        const primaryProduct = deal.products[0];
                                        if (primaryProduct.ProductImages && primaryProduct.ProductImages.length > 0) {
                                            deal.image_url = primaryProduct.ProductImages[0].image_url;
                                        }
                                    }
                                    
                                    // Only include the menu item if the deal is active and not expired
                                    if (deal) {
                                        item.entity_data = deal;
                                    } else {
                                        // If deal is expired or inactive, set entity_data to null
                                        item.entity_data = null;
                                    }
                                    break;
                            }
                        } catch (error) {
                            console.log(error)
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

                    // Process children recursively
                    if (item.children && item.children.length > 0) {
                        await processMenuItems(item.children);
                    }
                }
            };
            // Process all menu items
            await processMenuItems(menuTree);
            
            // Filter out menu items with expired deals (entity_data is null for deals)
            const filterExpiredDeals = (items) => {
                return items.filter(item => {
                    // If it's a deal and entity_data is null, filter it out
                    if (item.entity_type === 'deal' && !item.entity_data) {
                        return false;
                    }
                    
                    // Recursively filter children
                    if (item.children && item.children.length > 0) {
                        item.children = filterExpiredDeals(item.children);
                    }
                    
                    return true;
                });
            };
            
            const filteredMenuTree = filterExpiredDeals(menuTree);
            
            return successResponse(res, { data: filteredMenuTree }, 'Success');
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