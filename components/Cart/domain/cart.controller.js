const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, Cart, Product, Category, Brand, ProductImage, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Order, sequelize, ProductCategory, ProductBrand, Deal } = require("../../../models");
const Sequelize = require("sequelize");
const { Op } = Sequelize
const dealService = require('../helper/deal.service');

// Update includeClause to include deals for each product
const includeClause = [
    {
        model: Product,
        as: 'product',
        include: [
            {
                model: Deal,
                as: 'deals',
                through: { attributes: [] },
                attributes: ['id', 'name', 'required_qty']
            },
            { model: Category, as: 'Categories', through: { attributes: ['is_primary'] } },
            { model: Brand, as: 'Brands', through: { attributes: ['is_primary'] } },
            { model: ProductImage, as: 'ProductImages' },
            // {
            //     model: ProductAttributeTerm,
            //     as: 'productAttributeTerms',
            //     include: [
            //         { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
            //         { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
            //     ]
            // }
        ],
        paranoid: false
    },
    {
        model: ProductVariant,
        as: 'variant', // Match the alias from Cart model
        require: true,
        where: {
            id: {
                [Op.eq]: Sequelize.col('Cart.variant_id') // Ensures variant_id in Cart matches ProductVariant.id
            }
        },
        include: [
            {
                model: ProductVariantAttribute,
                as: 'variantAttributes',
                include: [
                    { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'], paranoid: false },
                    { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'], paranoid: false }
                ],
                paranoid: false
            },
            { model: ProductVariantImage, as: 'variantImages', attributes: ['id', 'variant_id', 'image_url', 'is_primary'] },
        ],
        paranoid: false
    },
]

module.exports.listCartItems = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const carts = await Cart.findAll({
            where: { user_id },
            include: includeClause
        });
        
        if (carts.length === 0) {
            return successResponse(res, [], 'Cart is empty');
        }

        // Get applicable deals and calculate discounts
        const deals = await dealService.getApplicableDeals(carts);
        const { totalDiscount, appliedDeals, itemDiscounts } = dealService.calculateDealDiscounts(carts, deals);
        // 1. Build a map: deal_id => total quantity in cart for that deal
        const dealQuantities = {};
        carts.forEach(item => {
            if (item.product && item.product.deals) {
                item.product.deals.forEach(deal => {
                    if (!dealQuantities[deal.id]) dealQuantities[deal.id] = 0;
                    dealQuantities[deal.id] += item.quantity;
                });
            }
        });
        // 2. For each cart item, determine if the deal toast should be shown
        const items = carts.map(item => {
            const price = item.variant ? item.variant.price : item.product.price;
            const subtotal = price * item.quantity;
            const itemDiscount = itemDiscounts[item.id] || 0;
            const total = subtotal - itemDiscount;
            const out_of_stock = item.variant ? item.variant.stock <= 0 || item.variant.stock_status == 'out_of_stock' : false;

            // Find the best deal for this item (if any)
            let show_deal_toast = false;
            let deal_required_qty = null;
            let deal_qty_needed = null;
            if (item.product && item.product.deals && item.product.deals.length > 0) {
                // Assume only one deal per product for simplicity, or pick the best one
                const deal = item.product.deals[0];
                deal_required_qty = deal.required_qty;
                const totalQtyForDeal = dealQuantities[deal.id] || 0;
                show_deal_toast = totalQtyForDeal < deal.required_qty;
                deal_qty_needed = Math.max(deal.required_qty - totalQtyForDeal, 0);
            }

            return {
                ...item.toJSON(),
                subtotal,
                discount: itemDiscount,
                total,
                out_of_stock,
                show_deal_toast,
                deal_required_qty,
                deal_qty_needed,
                applied_deals: appliedDeals.filter(deal => 
                    deal.items.some(dealItem => dealItem.cart_item_id === item.id)
                ).map(deal => ({
                    deal_id: deal.deal_id,
                    deal_name: deal.deal_name,
                    discount_amount: deal.items.find(dealItem => dealItem.cart_item_id === item.id)?.discount || 0
                }))
            };
        });
        const proceed_to_checkout = items.every(item=>!item.out_of_stock) 
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const total = subtotal - totalDiscount;

        const response = {
            items,
            proceed_to_checkout,
            deals: appliedDeals.map(deal => ({
                deal_id: deal.deal_id,
                deal_name: deal.deal_name,
                discount_amount: deal.discount_amount,
                items: deal.items.map(item => ({
                    cart_item_id: item.cart_item_id,
                    discount: item.discount
                }))
            })),
            summary: {
                subtotal,
                total_discount: totalDiscount,
                total
            }
        };

        return successResponse(res, response, 'Cart items retrieved successfully');
    } catch (error) {
        console.log("error", error);
        return errorResponse(res, error, error.message);
    }
};

// Get Cart by ID
module.exports.getCartById = async (req, res, next) => {
    try {
        const cart = await Cart.findByPk(req.params.id, {
            include: includeClause
        });
        if (!cart) {
            throw {
                message: "Cart item not found",
                statusCode: 404 // Changed to 404 (Not Found) instead of 400 (Bad Request)
            };
        }
        successResponse(res, cart, 'Cart item retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Create or Update Cart
module.exports.createCart = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const { product_id, variant_id, quantity } = req.body;
        // Validate required fields
        if (!product_id) {
            throw { message: "Product ID is required", statusCode: 400 };
        }
        if (!quantity || quantity < 1) {
            throw { message: "Quantity must be at least 1", statusCode: 400 };
        }

        // Check if cart item already exists for the user with the specified product and variant
        const cartExists = await Cart.findOne({
            where: { user_id, product_id, variant_id: variant_id || null },
            include: includeClause
        });
        
        // Fetch product and variant (if provided)
        const product = await Product.findByPk(product_id);
        if (!product) {
            throw { message: "Product not found", statusCode: 404 };
        }
        
        let availableStock = product.stock_quantity || 0; // Fallback to product stock if no variant
        if (variant_id) {
            const variant = await ProductVariant.findByPk(variant_id);
            if (!variant || variant.product_id !== product_id) {
                throw { message: `Variant not found or does not belong to the specified product`, statusCode: 404 };
            }
            availableStock = variant.stock || 0; // Use variant stock if specified
            
        }

        // Check stock availability
        if (availableStock === 0) {
            return errorResponse(res, {}, `${variant.slug} Out of stock`, 400);
        }

        if (quantity > availableStock) {
            return errorResponse(res, {}, `Only ${availableStock} item(s) available in stock. You have ${cartExists.quantity} in your basket.`, 400);
        }

        if (cartExists) {
            const addedQuantity = cartExists.quantity + quantity
            if(addedQuantity > availableStock ){
                // throw { message: `Added quantity exceed the limit only ${availableStock} item(s) available in stock`, statusCode: 400 };
                throw { message: `You cannot add that amount to the basket — we have ${availableStock} in stock and you already have ${cartExists.quantity} in your basket. View basket`, statusCode: 400 };
            }
            // Update existing cart item
            cartExists.quantity = addedQuantity;
            await cartExists.save();
            return successResponse(res, cartExists, 'Cart updated successfully');
        } else {
            // Create new cart item
            const newItem = await Cart.create({
                user_id,
                product_id,
                variant_id,
                quantity,
                price_at_addition: variant_id ? (await ProductVariant.findByPk(variant_id)).price : product.price // Set price at addition
            });
            const cartItem = await Cart.findByPk(newItem.id, { include: includeClause });
            return successResponse(res, cartItem, 'Cart created successfully');
        }
    } catch (error) {
        console.log("error", error);
        return errorResponse(res, error, error.message || 'Failed to create/update cart');
    }
};

// Update Cart
module.exports.updateCart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;

        const cartItem = await Cart.findByPk(id, { include: includeClause });
        if (!cartItem) {
            throw { statusCode: 404, message: 'Cart item not found' };
        }

        // Validate quantity
        if (quantity !== undefined && quantity < 1) {
            throw { message: "Quantity must be at least 1", statusCode: 400 };
        }

        // Check stock if quantity is updated
        if (quantity) {
            let addedQuantity = quantity - cartItem.quantity
            let totalQuantity = cartItem.quantity + addedQuantity
            const availableStock = cartItem.variant ? cartItem.variant.stock : cartItem.product.stock_quantity || 0;
            if(totalQuantity > availableStock ){
                throw { message: `You cannot add that amount to the basket — we have ${availableStock} in stock and you already have ${cartItem.quantity} in your basket. View basket`, statusCode: 400 };
            }
            // if (quantity > availableStock) {
            //     return errorResponse(res, {}, `Only ${availableStock} item(s) available in stock`, 400);
            // }
        }

        cartItem.quantity = quantity || cartItem.quantity;
        await cartItem.save();

        successResponse(res, cartItem, 'Cart updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to update cart');
    }
};

//cart bulk update
exports.bulkUpdateCart = async (req, res) => {
    const user_id = req.user.id;
    const { cartItems } = req.body;
    if (!user_id || !Array.isArray(cartItems) || cartItems.length === 0) {
        return errorResponse(res, {}, 'Invalid request data', 400);
    }

    const transaction = await sequelize.transaction(); // Start transaction

    try {
        const cartUpdates = [];

        for (const item of cartItems) {
            const { product_id, variant_id, quantity } = item;

            // Check if the product is already in the cart
            const existingCartItem = await Cart.findOne({
                where: { user_id, product_id, variant_id },
                transaction
            });
            if (!existingCartItem) {
                cartUpdates.push({
                    user_id,
                    product_id,
                    variant_id,
                    quantity
                });
            } else {
                // Increment quantity using Sequelize's increment method
                await existingCartItem.increment('quantity', { 
                    by: parseInt(quantity), 
                    transaction 
                });
            }
        }

        // Bulk insert new items
        if (cartUpdates.length > 0) {
            await Cart.bulkCreate(cartUpdates, { transaction });
        }

        await transaction.commit(); // Commit transaction
        
        successResponse(res, cartUpdates, 'Cart updated successfully');

    } catch (error) {
        await transaction.rollback(); // Rollback on error
        console.error('Bulk update error:', error);
        return errorResponse(res, error, error.message || 'Failed to update cart');
    }
};


// Delete Cart
module.exports.deleteCart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const cart = await Cart.findByPk(id);
        if (!cart) {
            throw { statusCode: 404, message: 'Cart item not found' };
        }
        await cart.destroy({ force: true });
        successResponse(res, { message: 'Cart item deleted successfully' });
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to delete cart');
    }
};

module.exports.checkCartItemsStock = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const carts = await Cart.findAll({
            where: { user_id },
            include: includeClause
        });

        if (carts.length === 0) {
            return successResponse(res, [], 'Cart is empty');
        }

        const stockStatus = await Promise.all(carts.map(async (cart) => {
            const variant = cart.variant;
            const product = cart.product;
            
            // Get available stock (variant stock if exists, otherwise product stock)
            const availableStock = variant ? variant.stock : (product.stock_quantity || 0);
            console.log("variant", variant.stock_status);
            // Check if item is out of stock
            let isOutOfStock = false;
            if(availableStock == 0 || variant.stock_status == 'out_of_stock'){
                console.log("variant", variant.stock_status);
                isOutOfStock = true;
            }
            console.log("isOutOfStock", isOutOfStock);
            // Check if requested quantity exceeds available stock
            const isQuantityExceeded = cart.quantity > availableStock;
            console.log("availableStock", availableStock);
            console.log("isQuantityExceeded", isQuantityExceeded);
            let message = '';
            if (isOutOfStock) {
                message = `Varient is out of stock`;    //${variant ? variant.slug : product.name}
            } else if (isQuantityExceeded) {
                message = `Only ${availableStock} item(s) available in stock for ${variant ? variant.slug : product.name}`;
            }else {
                message = `Variant is in stock`;   //${variant ? variant.slug : product.name}
            }

            return {
                itemId: cart.id,
                message,
                isOutOfStock: isOutOfStock || isQuantityExceeded
            };
        }));

        return successResponse(res, stockStatus, 'Stock status checked successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};