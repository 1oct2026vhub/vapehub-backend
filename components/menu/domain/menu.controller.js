const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Menu, MenuItem, Product, Brand, Blog, Category, Deal, sequelize, ProductImage } = require("../../../models");
const logger = require("../../../library/logger");
const { Op } = require("sequelize");
const { getNewProducts, getHotProducts, getProductsByEntity, isProductNew, isProductHot } = require("../helper/menu.helper");
const { cacheOrFetch } = require('../../../library/cache');

// Helper function to check if a menu is a letter menu (single A-Z letter)
const isLetterMenu = (menu) => {
    const label = (menu.label || '').trim();
    return label.length === 1 && label >= 'A' && label <= 'Z' && 
           menu.entity_type === 'page' && menu.original === '#';
};

// Optimized function to sort menu items - single pass separation + sort
const sortMenuItems = (items) => {
    if (!items || items.length === 0) return items;
    
    // Single pass: separate letter menus from regular menus
    const letterMenus = [];
    const regularMenus = [];
    
    items.forEach(menu => {
        if (isLetterMenu(menu)) {
            letterMenus.push(menu);
        } else {
            regularMenus.push(menu);
        }
    });
    
    // Sort letter menus alphabetically
    if (letterMenus.length > 0) {
        letterMenus.sort((a, b) => {
            const labelA = (a.label || '').trim().toUpperCase();
            const labelB = (b.label || '').trim().toUpperCase();
            return labelA.localeCompare(labelB);
        });
    }
    
    // Sort regular menus by order, then by label
    if (regularMenus.length > 0) {
        regularMenus.sort((a, b) => {
            if (a.order !== b.order) {
                return a.order - b.order;
            }
            const labelA = (a.label || '').trim().toUpperCase();
            const labelB = (b.label || '').trim().toUpperCase();
            return labelA.localeCompare(labelB);
        });
    }
    
    // Recursively sort children only once
    [...letterMenus, ...regularMenus].forEach(menu => {
        if (menu.children && menu.children.length > 0) {
            menu.children = sortMenuItems(menu.children);
        }
    });
    
    // Combine: regular menus first, then letter menus
    return [...regularMenus, ...letterMenus];
};

module.exports = {

    // Get all menus - OPTIMIZED VERSION
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
            
            // OPTIMIZATION: Collect all entity IDs first
            const entityIds = {
                brand: new Set(),
                category: new Set(),
                product: new Set(),
                blog: new Set(),
                deal: new Set()
            };
            
            const collectEntityIds = (items) => {
                items.forEach(item => {
                    if (item.entity_type && item.entity_id) {
                        entityIds[item.entity_type]?.add(item.entity_id);
                    }
                    if (item.children && item.children.length > 0) {
                        collectEntityIds(item.children);
                    }
                });
            };
            
            collectEntityIds(menuTree);
            
            // OPTIMIZATION: Batch fetch all entities in parallel
            const [brandsData, categoriesData, productsData, blogsData, dealsData] = await Promise.all([
                // Fetch all brands
                Array.from(entityIds.brand).length > 0 ? Brand.findAll({
                    where: { id: { [Op.in]: Array.from(entityIds.brand) } },
                    attributes: ['id', 'name', 'slug', 'logo_url'],
                    raw: true
                }) : Promise.resolve([]),
                
                // Fetch all categories
                Array.from(entityIds.category).length > 0 ? Category.findAll({
                    where: { id: { [Op.in]: Array.from(entityIds.category) } },
                    attributes: ['id', 'name', 'slug', 'logo_url'],
                    raw: true
                }) : Promise.resolve([]),
                
                // Fetch all products with images
                Array.from(entityIds.product).length > 0 ? Product.findAll({
                    where: { id: { [Op.in]: Array.from(entityIds.product) } },
                    attributes: ['id', 'name', 'slug', 'price', 'discount_price', 'createdAt'],
                    include: [{
                        model: ProductImage,
                        as: 'ProductImages',
                        where: { is_primary: true },
                        attributes: ['image_url'],
                        required: false
                    }]
                }) : Promise.resolve([]),
                
                // Fetch all blogs
                Array.from(entityIds.blog).length > 0 ? Blog.findAll({
                    where: { id: { [Op.in]: Array.from(entityIds.blog) } },
                    attributes: [['title', 'name'], 'id', 'slug', 'image_url'],
                    raw: true
                }) : Promise.resolve([]),
                
                // Fetch all active deals
                Array.from(entityIds.deal).length > 0 ? Deal.findAll({
                    where: {
                        id: { [Op.in]: Array.from(entityIds.deal) },
                        is_active: true,
                        is_deleted: false,
                        valid_from: { [Op.lte]: new Date() },
                        valid_to: { [Op.gte]: new Date() }
                    },
                    attributes: ['id', 'name', 'slug', 'deal_type', 'discount_percent', 'fixed_price', 'is_active', 'valid_from', 'valid_to', 'image_url'],
                    include: [{
                        model: Product,
                        as: 'products',
                        through: { attributes: [] },
                        attributes: ['id', 'name', 'slug', 'price', 'discount_price'],
                        include: [{
                            model: ProductImage,
                            as: 'ProductImages',
                            where: { is_primary: true },
                            attributes: ['image_url'],
                            required: false
                        }]
                    }]
                }) : Promise.resolve([])
            ]);
            
            // OPTIMIZATION: Create lookup maps for O(1) access
            const brandMap = new Map(brandsData.map(b => [b.id, b]));
            const categoryMap = new Map(categoriesData.map(c => [c.id, c]));
            const productMap = new Map(productsData.map(p => [p.id, p]));
            const blogMap = new Map(blogsData.map(b => [b.id, b]));
            const dealMap = new Map(dealsData.map(d => [d.id, d]));
            
            // OPTIMIZATION: Batch check for new and hot products
            const productIds = Array.from(entityIds.product);
            let newProductIds = new Set();
            let hotProductIds = new Set();
            
            if (productIds.length > 0) {
                const twentyEightDaysAgo = new Date();
                twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
                
                // Check new products in batch (New In window uses new_in_at)
                const newProducts = await Product.findAll({
                    where: {
                        id: { [Op.in]: productIds },
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
                    attributes: ['id'],
                    raw: true
                });
                newProductIds = new Set(newProducts.map(p => p.id));
                
                // Check hot products - get global top 10 (cached), then check if menu products are in that list
                const globalHotProducts = await cacheOrFetch('menu:global-hot-products', async () => {
                    const twentyEightDaysAgo = new Date();
                    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
                    return sequelize.query(`
                        SELECT 
                            p.id,
                            COALESCE(SUM(oi.quantity), 0) as total_sold
                        FROM products p
                        LEFT JOIN order_items oi ON p.id = oi.product_id
                        LEFT JOIN orders o ON oi.order_id = o.id 
                            AND o.status IN ('completed', 'delivered')
                            AND o.updatedAt >= :startDate
                        WHERE p.status = 'published'
                        GROUP BY p.id
                        HAVING total_sold > 0
                        ORDER BY total_sold DESC
                        LIMIT 10
                    `, {
                        replacements: { startDate: twentyEightDaysAgo },
                        type: sequelize.QueryTypes.SELECT
                    });
                }, 300);
                
                // Only mark menu products that are in the global top 10
                const globalHotProductIds = new Set(globalHotProducts.map(p => p.id));
                hotProductIds = new Set(productIds.filter(id => globalHotProductIds.has(id)));
            }
            
            // OPTIMIZATION: Batch fetch related products for category/brand/deal entities
            const relatedProductsMap = new Map();
            
            // Collect entities that need related products
            const entityTypesNeedingProducts = {
                category: Array.from(entityIds.category),
                brand: Array.from(entityIds.brand),
                deal: Array.from(entityIds.deal)
            };
            
            // Fetch related products for all categories/brands/deals in parallel
            await Promise.all([
                ...entityTypesNeedingProducts.category.map(async (categoryId) => {
                    try {
                        const products = await getProductsByEntity('category', categoryId, 10);
                        relatedProductsMap.set(`category_${categoryId}`, products);
                    } catch (error) {
                        logger.error(`Error fetching products for category ${categoryId}:`, error);
                        relatedProductsMap.set(`category_${categoryId}`, []);
                    }
                }),
                ...entityTypesNeedingProducts.brand.map(async (brandId) => {
                    try {
                        const products = await getProductsByEntity('brand', brandId, 10);
                        relatedProductsMap.set(`brand_${brandId}`, products);
                    } catch (error) {
                        logger.error(`Error fetching products for brand ${brandId}:`, error);
                        relatedProductsMap.set(`brand_${brandId}`, []);
                    }
                }),
                ...entityTypesNeedingProducts.deal.map(async (dealId) => {
                    try {
                        const products = await getProductsByEntity('deal', dealId, 10);
                        relatedProductsMap.set(`deal_${dealId}`, products);
                    } catch (error) {
                        logger.error(`Error fetching products for deal ${dealId}:`, error);
                        relatedProductsMap.set(`deal_${dealId}`, []);
                    }
                })
            ]);
            
            // OPTIMIZATION: Process menu items using lookup maps (no more DB queries!)
            const processMenuItems = (items) => {
                items.forEach(item => {
                    if (item.entity_type && item.entity_id) {
                        try {
                            switch (item.entity_type) {
                                case 'brand':
                                    const brand = brandMap.get(item.entity_id);
                                    if (brand) {
                                        const brandData = { ...brand };
                                        if (brandData.logo_url && (item.show_image && item.show_image == 1)) {
                                            brandData.image_url = brandData.logo_url;
                                            delete brandData.logo_url;
                                        }
                                        item.entity_data = brandData;
                                    } else {
                                        item.entity_data = null;
                                    }
                                    break;
                                    
                                case 'category':
                                    const category = categoryMap.get(item.entity_id);
                                    if (category) {
                                        const categoryData = { ...category };
                                        if (categoryData.logo_url && (item.show_image && item.show_image == 1)) {
                                            categoryData.image_url = categoryData.logo_url;
                                            delete categoryData.logo_url;
                                        }
                                        item.entity_data = categoryData;
                                    } else {
                                        item.entity_data = null;
                                    }
                                    break;
                                    
                                case 'product':
                                    const product = productMap.get(item.entity_id);
                                    if (product) {
                                        const productData = product.toJSON ? product.toJSON() : { ...product };
                                        delete productData.createdAt;
                                        item.entity_data = productData;
                                    } else {
                                        item.entity_data = null;
                                    }
                                    break;
                                    
                                case 'blog':
                                    const blog = blogMap.get(item.entity_id);
                                    item.entity_data = blog ? { ...blog } : null;
                                    break;
                                    
                                case 'deal':
                                    const deal = dealMap.get(item.entity_id);
                                    if (deal) {
                                        const dealData = deal.toJSON ? deal.toJSON() : { ...deal };
                                    // Use deal's own image_url if available, otherwise fallback to primary product image
                                        if (!dealData.image_url && dealData.products && dealData.products.length > 0) {
                                            const primaryProduct = dealData.products[0];
                                        if (primaryProduct.ProductImages && primaryProduct.ProductImages.length > 0) {
                                                dealData.image_url = primaryProduct.ProductImages[0].image_url;
                                        }
                                    }
                                        item.entity_data = dealData;
                                    } else {
                                        item.entity_data = null;
                                    }
                                    break;
                            }
                        } catch (error) {
                            logger.error(`Error processing ${item.entity_type} data:`, error);
                            item.entity_data = null;
                        }
                    }
                    
                    // Check if product is new or hot using pre-fetched data
                    item.is_new = false;
                    item.is_hot = false;
                    
                    if (item.entity_type === 'product' && item.entity_data && item.entity_data.id) {
                        item.is_new = newProductIds.has(item.entity_data.id);
                        item.is_hot = hotProductIds.has(item.entity_data.id);
                    }
                    
                    // Add related products from pre-fetched map
                    if (item.entity_type && item.entity_id && ['category', 'brand', 'deal'].includes(item.entity_type)) {
                        const key = `${item.entity_type}_${item.entity_id}`;
                        item.related_products = relatedProductsMap.get(key) || [];
                    }

                    // Process children recursively
                    if (item.children && item.children.length > 0) {
                        processMenuItems(item.children);
                    }
                });
            };
            
            // Process all menu items
            processMenuItems(menuTree);
            
            // Helper function to ensure consistent field mapping (backup)
            const ensureConsistentFields = (items) => {
                items.forEach(item => {
                    // Ensure brands and categories use image_url instead of logo_url
                    if (item.entity_data && (item.entity_type === 'brand' || item.entity_type === 'category')) {
                        if (item.entity_data.logo_url && !item.entity_data.image_url) {
                            item.entity_data.image_url = item.entity_data.logo_url;
                            delete item.entity_data.logo_url;
                        }
                    }
                    
                    // Process children recursively
                    if (item.children && item.children.length > 0) {
                        ensureConsistentFields(item.children);
                    }
                });
            };
            
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
            
            // Single optimized sort after filtering
            const finalMenuTree = sortMenuItems(filteredMenuTree);
            
            // Ensure consistent field mapping after filtering
            ensureConsistentFields(finalMenuTree);
            
            return successResponse(res, { data: finalMenuTree }, 'Success');
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
            menu.children = children;
            tree.push(menu);
        }
    }
    
    // Don't sort here - sorting will be done once at the end for better performance
    return tree;
};



// getMenus: async (req, res) => {
//     try {
//         const where = {};
//         const filters = req.query;
        
//         if (filters.status !== undefined) {
//             where.status = filters.status;
//         }
//         if (filters.entity_type) {
//             where.entity_type = filters.entity_type;
//         }
//         if (filters.label) {
//             where.label = { [Op.like]: `%${filters.label}%` };
//         }
//         // First get all menus with their children
//         const menus = await Menu.findAll({
//             where,
//             order: [['order', 'ASC']],
//             include: [
//                 {
//                     model: Menu,
//                     as: 'parent',
//                     attributes: ['id', 'label', 'original']
//                 },
//                 {
//                     model: Menu,
//                     as: 'children',
//                     attributes: ['id', 'label', 'order', 'original', 'status', 'entity_type', 'entity_id']
//                 }
//             ]
//         });
//         // Convert to tree structure
//         const menuTree = buildMenuTree(menus.map(menu => menu.toJSON()));
//         // Function to process menu items recursively
//         const processMenuItems = async (items) => {
//             for (const item of items) {
//                 if (item.entity_type && item.entity_id) {
//                     const baseAttributes = ['id', 'name', 'slug'];
                    
//                     // Determine which attributes to fetch based on show_image and entity type
//                     let attributes = baseAttributes;
//                     if (item.show_image && item.show_image == 1) {
//                         switch (item.entity_type) {
//                             case 'brand':
//                             case 'category':
//                                 attributes = [...baseAttributes, 'logo_url'];
//                                 break;
//                             case 'blog':
//                                 attributes = [...baseAttributes, 'image_url'];
//                                 break;
//                             case 'product':
//                             case 'deal':
//                                 // These will be handled separately with includes
//                                 attributes = baseAttributes;
//                                 break;
//                         }
//                     } else {
//                         // Even if show_image is false, we need logo_url for mapping
//                         if (item.entity_type === 'brand' || item.entity_type === 'category') {
//                             attributes = [...baseAttributes, 'logo_url'];
//                         }
//                     }

//                     try {
//                         switch (item.entity_type) {
//                             case 'brand':
//                                 const brand = await Brand.findByPk(item.entity_id, {
//                                     attributes: attributes
//                                 });
//                                 if (brand) {
//                                     const brandData = brand.toJSON();
//                                     if (brandData.logo_url && (item.show_image && item.show_image == 1)) {
//                                         brandData.image_url = brandData.logo_url;
//                                         delete brandData.logo_url;
//                                     }
//                                     item.entity_data = brandData;
//                                 } else {
//                                     item.entity_data = null;
//                                 }
//                                 break;
//                             case 'category':
//                                 const category = await Category.findByPk(item.entity_id, {
//                                     attributes: attributes
//                                 });
//                                 // Map logo_url to image_url for consistency (regardless of show_image)
//                                 if (category) {
//                                     const categoryData = category.toJSON();
//                                     if (categoryData.logo_url && (item.show_image && item.show_image == 1)) {
//                                         categoryData.image_url = categoryData.logo_url;
//                                         delete categoryData.logo_url;
//                                     }
//                                     item.entity_data = categoryData;
//                                 } else {
//                                     item.entity_data = null;
//                                 }
//                                 break;
//                             case 'product':
//                                 const product = await Product.findByPk(item.entity_id, {
//                                     attributes: [...baseAttributes, 'price', 'discount_price'],
//                                     include: [{
//                                         model: ProductImage,
//                                         as: 'ProductImages',
//                                         where: { is_primary: true },
//                                         attributes: ['image_url'],
//                                         required: false
//                                     }]
//                                 });
//                                 if (product && product.ProductImages && product.ProductImages.length > 0) {
//                                     product.image_url = product.ProductImages[0].image_url;
//                                 }
//                                 item.entity_data = product;
//                                 break;
//                             case 'blog':
//                                 const blog = await Blog.findByPk(item.entity_id, {
//                                     attributes: attributes
//                                 });
//                                 item.entity_data = blog;
//                                 break;
//                             case 'deal':
//                                 const deal = await Deal.findOne({
//                                     where: {
//                                         id: item.entity_id,
//                                         is_active: true,
//                                         is_deleted: false,
//                                         valid_from: { [Op.lte]: new Date() },
//                                         valid_to: { [Op.gte]: new Date() }
//                                     },
//                                     attributes: [...baseAttributes, 'deal_type', 'discount_percent', 'fixed_price', 'is_active', 'valid_from', 'valid_to', 'image_url'],
//                                     include: [{
//                                         model: Product,
//                                         as: 'products',
//                                         through: { attributes: [] }, // Don't include junction table attributes
//                                         attributes: ['id', 'name', 'slug', 'price', 'discount_price'],
//                                         include: [{
//                                             model: ProductImage,
//                                             as: 'ProductImages',
//                                             where: { is_primary: true },
//                                             attributes: ['image_url'],
//                                             required: false
//                                         }]
//                                     }]
//                                 });
//                                 // Use deal's own image_url if available, otherwise fallback to primary product image
//                                 if (deal && !deal.image_url && deal.products && deal.products.length > 0) {
//                                     const primaryProduct = deal.products[0];
//                                     if (primaryProduct.ProductImages && primaryProduct.ProductImages.length > 0) {
//                                         deal.image_url = primaryProduct.ProductImages[0].image_url;
//                                     }
//                                 }
                                
//                                 // Only include the menu item if the deal is active and not expired
//                                 if (deal) {
//                                     item.entity_data = deal;
//                                 } else {
//                                     // If deal is expired or inactive, set entity_data to null
//                                     item.entity_data = null;
//                                 }
//                                 break;
//                         }
//                     } catch (error) {
//                         logger.error(`Error fetching ${item.entity_type} data:`, error);
//                         item.entity_data = null;
//                     }
                    

//                 }

//                 // Handle new and hot products for menu items
//                 // Check if the specific product in entity_data is new or hot
//                 let isNew = false;
//                 let isHot = false;
                
//                 if (item.entity_type === 'product' && item.entity_data && item.entity_data.id) {
//                     try {
//                         isNew = await isProductNew(item.entity_data.id);
//                     } catch (error) {
//                         logger.error('Error checking if product is new:', error);
//                     }

//                     try {
//                         isHot = await isProductHot(item.entity_data.id);
//                     } catch (error) {
//                         logger.error('Error checking if product is hot:', error);
//                     }
//                 }
                
//                 // Add is_new and is_hot flags to menu items
//                 item.is_new = isNew;
//                 item.is_hot = isHot;

//                 // Handle products based on entity type for mega menu
//                 if (item.entity_type && item.entity_id && ['category', 'brand', 'deal'].includes(item.entity_type)) {
//                     try {
//                         item.related_products = await getProductsByEntity(item.entity_type, item.entity_id, 10);
//                     } catch (error) {
//                         logger.error(`Error fetching products for ${item.entity_type}:`, error);
//                         item.related_products = [];
//                     }
//                 }

//                 // Process children recursively
//                 if (item.children && item.children.length > 0) {
//                     await processMenuItems(item.children);
//                 }
//             }
//         };
//         // Process all menu items
//         await processMenuItems(menuTree);
        
//         // Helper function to ensure consistent field mapping (backup)
//         const ensureConsistentFields = (items) => {
//             items.forEach(item => {
//                 // Ensure brands and categories use image_url instead of logo_url
//                 if (item.entity_data && (item.entity_type === 'brand' || item.entity_type === 'category')) {
//                     if (item.entity_data.logo_url && !item.entity_data.image_url) {
//                         item.entity_data.image_url = item.entity_data.logo_url;
//                         delete item.entity_data.logo_url;
//                     }
//                 }
                
//                 // Process children recursively
//                 if (item.children && item.children.length > 0) {
//                     ensureConsistentFields(item.children);
//                 }
//             });
//         };
        
//         // Filter out menu items with expired deals (entity_data is null for deals)
//         const filterExpiredDeals = (items) => {
//             return items.filter(item => {
//                 // If it's a deal and entity_data is null, filter it out
//                 if (item.entity_type === 'deal' && !item.entity_data) {
//                     return false;
//                 }
                
//                 // Recursively filter children
//                 if (item.children && item.children.length > 0) {
//                     item.children = filterExpiredDeals(item.children);
//                 }
                
//                 return true;
//             });
//         };
        
//         const filteredMenuTree = filterExpiredDeals(menuTree);
        
//         // Ensure consistent field mapping after filtering
//         ensureConsistentFields(filteredMenuTree);
        
//         return successResponse(res, { data: filteredMenuTree }, 'Success');
//     } catch (error) {
//         logger.error('Error fetching menus:', error);
//         return errorResponse(res, error);
//     }
// },

// const buildMenuTree = (menus, parentId = null) => {
//     const tree = [];
    
//     for (const menu of menus) {
//         if (menu.menu_parent === parentId) {
//             const children = buildMenuTree(menus, menu.id);
//             if (children.length) {
//                 menu.children = children;
//             }
//             tree.push(menu);
//         }
//     }
    
//     return tree;
// };