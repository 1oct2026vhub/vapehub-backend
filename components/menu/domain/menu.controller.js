const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Menu, MenuItem, Product, Brand, Blog, Category, sequelize, ProductImage } = require("../../../models");
const logger = require("../../../library/logger");

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
                where.label = { [Op.iLike]: `%${filters.label}%` };
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
                            }
                        } catch (error) {
                            logger.error(`Error fetching ${item.entity_type} data:`, error);
                            item.entity_data = null;
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
                                    }
                                } catch (error) {
                                    logger.error(`Error fetching ${child.entity_type} data:`, error);
                                    child.entity_data = null;
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