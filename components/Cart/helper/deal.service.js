const { Deal, Product, DealProduct } = require('../../../models');
const { DEAL_TYPES } = require('../../../config/constants');
const { Op } = require('sequelize');

class DealService {
    // Get all applicable deals for cart items
    async getApplicableDeals(cartItems) {
        const productIds = cartItems.map(item => item.product_id);
        const now = new Date();
        
        const deals = await Deal.findAll({
            where: {
                is_active: true,
                valid_from: { [Op.lte]: now },
                valid_to: { [Op.gte]: now }
            },
            include: [{
                model: Product,
                as: 'products',
                where: { id: { [Op.in]: productIds } },
                required: true
            }]
        });
        return deals;
    }

    // Calculate deal discounts for cart items
    calculateDealDiscounts(cartItems, deals) {
        let totalDiscount = 0;
        const appliedDeals = [];
        const itemDiscounts = {};
        deals.forEach(deal => {
            const dealResult = this.applyDealLogic(deal, cartItems);
            if (dealResult.discount > 0) {
                totalDiscount += dealResult.discount;
                appliedDeals.push({
                    deal_id: deal.id,
                    deal_name: deal.name,
                    discount_amount: dealResult.discount,
                    items: dealResult.items
                });

                // Track item-level discounts
                dealResult.items.forEach(item => {
                    if (!itemDiscounts[item.cart_item_id]) {
                        itemDiscounts[item.cart_item_id] = 0;
                    }
                    itemDiscounts[item.cart_item_id] += item.discount;
                });
            }
        });
        
        return {
            totalDiscount,
            appliedDeals,
            itemDiscounts
        };
    }

    // Apply specific deal logic based on type
    applyDealLogic(deal, cartItems) {
        switch (deal.deal_type) {
            case DEAL_TYPES.BUY_N_FOR_FIXED:
                return this.applyBuyNForFixed(deal, cartItems);
            case DEAL_TYPES.BUY_X_GET_Y_FREE:
                return this.applyBuyXGetYFree(deal, cartItems);
            case DEAL_TYPES.BUY_MORE_SAVE_MORE:
                return this.applyBuyMoreSaveMore(deal, cartItems);
            case DEAL_TYPES.BUNDLE:
                return this.applyBundle(deal, cartItems);
            case DEAL_TYPES.QUANTITY_DISCOUNT:
                return this.applyQuantityDiscount(deal, cartItems);
            default:
                return { discount: 0, items: [] };
        }
    }

    // Individual deal type implementations
    applyBuyNForFixed(deal, cartItems) {
        
        const eligibleItems = cartItems.filter(item => 
            deal.products.some(p => p.id === item.product_id)
        );

        if (eligibleItems.length === 0) {
            return { discount: 0, items: [] };
        }

        // Calculate total quantity and sets
        const totalQuantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
        const completeSets = Math.floor(totalQuantity / deal.required_qty);
        const remainingItems = totalQuantity % deal.required_qty;

        // Calculate item-level details
        let remainingDealItems = completeSets * deal.required_qty;
        const itemDetails = eligibleItems.map(item => {
            const unitPrice = item.variant ? item.variant.price : item.product.price;
            const originalSubtotal = unitPrice * item.quantity;
            
            // Calculate how many items from this product are in the deal sets
            const itemsInDealSets = Math.min(item.quantity, remainingDealItems);
            remainingDealItems -= itemsInDealSets;
            const remainingQty = item.quantity - itemsInDealSets;

            // Calculate deal price for this product
            const dealPricePerItem = deal.fixed_price / deal.required_qty;
            const dealSubtotal = (itemsInDealSets * dealPricePerItem) + (remainingQty * unitPrice);
            const itemDiscount = originalSubtotal - dealSubtotal;
          
            return {
                cart_item_id: item.id,
                product_id: item.product_id,
                name: item.product.name,
                qty: item.quantity,
                unit_price: unitPrice,
                original_subtotal: originalSubtotal,
                deal_applied_qty: itemsInDealSets,
                non_deal_qty: remainingQty,
                subtotal: dealSubtotal,
                total_discount: itemDiscount,
                applied_deals: [`${deal.name} (${completeSets} sets)`]
            };
        });

        // Calculate totals
        const totalDiscount = itemDetails.reduce((sum, item) => sum + item.total_discount, 0);
        const totalPrice = itemDetails.reduce((sum, item) => sum + item.subtotal, 0);

        return {
            discount: totalDiscount,
            items: itemDetails.map(item => ({
                cart_item_id: item.cart_item_id,
                discount: item.total_discount,
                deal_details: {
                    product_id: item.product_id,
                    name: item.name,
                    qty: item.qty,
                    unit_price: item.unit_price,
                    deal_applied_qty: item.deal_applied_qty,
                    non_deal_qty: item.non_deal_qty,
                    subtotal: item.subtotal,
                    total_discount: item.total_discount,
                    applied_deals: item.applied_deals
                }
            })),
            summary: {
                deal_name: deal.name,
                total_items: totalQuantity,
                total_discount: totalDiscount,
                total_price: totalPrice
            }
        };
    }

    applyBuyXGetYFree(deal, cartItems) {
        const eligibleItems = cartItems.filter(item => 
            deal.products.some(p => p.id === item.product_id)
        );

        if (eligibleItems.length === 0) {
            return { discount: 0, items: [] };
        }
        
        let totalDiscount = 0;
        const itemDetails = [];

        for (const item of eligibleItems) {
            const unitPrice = item.variant ? item.variant.price : item.product.price;
            const originalSubtotal = unitPrice * item.quantity;
            
            // Calculate complete sets and free items
            const completeSets = Math.floor(item.quantity / (deal.required_qty + deal.get_qty));
            const freeItems = completeSets * deal.get_qty;
            const paidItems = item.quantity - freeItems;
            
            // Calculate subtotal and discount
            const dealSubtotal = paidItems * unitPrice;
            const itemDiscount = originalSubtotal - dealSubtotal;
            
            totalDiscount += itemDiscount;
            itemDetails.push({
                cart_item_id: item.id,
                discount: itemDiscount,
                deal_details: {
                    product_id: item.product_id,
                    name: item.product.name,
                    qty: item.quantity,
                    unit_price: unitPrice,
                    deal_applied_qty: paidItems,
                    non_deal_qty: freeItems,
                    subtotal: dealSubtotal,
                    total_discount: itemDiscount,
                    applied_deals: [`${deal.name} (${completeSets} sets)`]
                }
            });
        }
        
        return {
            discount: totalDiscount,
            items: itemDetails
        };
    }

    applyBuyMoreSaveMore(deal, cartItems) {
        const eligibleItems = cartItems.filter(item => 
            deal.products.some(p => p.id === item.product_id)
        );

        if (eligibleItems.length === 0) {
            return { discount: 0, items: [] };
        }
        
        const totalQuantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
        const regularPrice = eligibleItems.reduce((sum, item) => 
            sum + (item.variant ? item.variant.price : item.product.price) * item.quantity, 0);
            
        const applicableTier = deal.tiered_qty_json
            .sort((a, b) => b.min - a.min)
            .find(tier => totalQuantity >= tier.min);
            
        if (!applicableTier) {
            return { discount: 0, items: [] };
        }
        
        const discount = regularPrice * (applicableTier.discount / 100);
        const discountPerItem = discount / totalQuantity;

        return {
            discount,
            items: eligibleItems.map(item => ({
                cart_item_id: item.id,
                discount: discountPerItem * item.quantity,
                deal_details: {
                    product_id: item.product_id,
                    name: item.product.name,
                    qty: item.quantity,
                    unit_price: item.variant ? item.variant.price : item.product.price,
                    deal_applied_qty: item.quantity,
                    non_deal_qty: 0,
                    subtotal: (item.quantity * (item.variant ? item.variant.price : item.product.price)) - (discountPerItem * item.quantity),
                    total_discount: discountPerItem * item.quantity,
                    applied_deals: [`${deal.name} (${applicableTier.discount}% off)`]
                }
            }))
        };
    }

    applyBundle(deal, cartItems) {
        const bundleProducts = deal.bundle_product_ids_json;
        if (!bundleProducts || !Array.isArray(bundleProducts)) {
            return { discount: 0, items: [] };
        }

        const bundleItems = cartItems.filter(item => 
            bundleProducts.includes(item.product_id)
        );
        
        if (bundleItems.length !== bundleProducts.length) {
            return { discount: 0, items: [] };
        }
        
        const regularPrice = bundleItems.reduce((sum, item) => 
            sum + (item.variant ? item.variant.price : item.product.price) * item.quantity, 0);
            
        const discount = regularPrice - deal.fixed_price;
        const discountPerItem = discount / bundleItems.length;

        return {
            discount,
            items: bundleItems.map(item => ({
                cart_item_id: item.id,
                discount: discountPerItem,
                deal_details: {
                    product_id: item.product_id,
                    name: item.product.name,
                    qty: item.quantity,
                    unit_price: item.variant ? item.variant.price : item.product.price,
                    deal_applied_qty: item.quantity,
                    non_deal_qty: 0,
                    subtotal: (item.quantity * (item.variant ? item.variant.price : item.product.price)) - discountPerItem,
                    total_discount: discountPerItem,
                    applied_deals: [`${deal.name}`]
                }
            }))
        };
    }

    applyQuantityDiscount(deal, cartItems) {
        const eligibleItems = cartItems.filter(item => 
            deal.products.some(p => p.id === item.product_id)
        );

        if (eligibleItems.length === 0) {
            return { discount: 0, items: [] };
        }

        let totalDiscount = 0;
        const itemDiscounts = [];
        
        for (const item of eligibleItems) {
            const applicableTier = deal.tiered_qty_json
                .sort((a, b) => b.min - a.min)
                .find(tier => item.quantity >= tier.min);
                
            if (!applicableTier) continue;
            
            const itemPrice = item.variant ? item.variant.price : item.product.price;
            const itemDiscount = itemPrice * item.quantity * (applicableTier.discount / 100);
            
            totalDiscount += itemDiscount;
            itemDiscounts.push({
                cart_item_id: item.id,
                discount: itemDiscount,
                deal_details: {
                    product_id: item.product_id,
                    name: item.product.name,
                    qty: item.quantity,
                    unit_price: itemPrice,
                    deal_applied_qty: item.quantity,
                    non_deal_qty: 0,
                    subtotal: (item.quantity * itemPrice) - itemDiscount,
                    total_discount: itemDiscount,
                    applied_deals: [`${deal.name} (${applicableTier.discount}% off)`]
                }
            });
        }
        
        return {
            discount: totalDiscount,
            items: itemDiscounts
        };
    }
}

module.exports = new DealService();