const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Coupon, CouponUsage, User, Product, ProductImage, Cart, Flavor, Order } = require("../../../models");
const logger = require("../../../library/logger");

// module.exports.getCoupon = async (req, res, next) => {
//     try {
//         console.log("entered")
//         const coupons = await Cart.findAll();
//         successResponse(res, coupons, 'Success');
//     } catch (error) {
//         return errorResponse(res, error, error.message);
//     }
// }

module.exports.checkout = async (req, res, next) => {
    try {
        const userId = 5 || req.user.id ;
        const { couponCode } = req.body;
        let total = 0
        const cart = await Cart.findAll({
                        where: { user_id: userId },
                        include: [
                          {
                            model: User,
                            attributes: ["id", "first_name", "last_name", "email", "phone"], // User details
                            as: "User"
                          },
                          {
                            model: Product,
                            attributes: ["id", "name", "price", "discount_price", "stock_quantity"], // Product details
                            as: "Product",
                            // include: [
                            //     {
                            //       model: Category,
                            //       attributes: ["id", "name"], // Category details
                            //       as: "Category",
                            //     },
                            //     {
                            //         model: Brand,
                            //         attributes: ["id", "name"], // Brand details
                            //         as: "Brand",
                            //       },
                            //     {
                            //         model: ProductImage,
                            //         attributes: ["id", "image_url"], // Product image details
                            //         as: "ProductImages",
                            //       },
                            //   ],
                          },
                          {
                            model: Flavor,
                            attributes: ["id", "name"], // Flavor details
                            as: "Flavor"
                          }
                        ]
                      });
        if (cart.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            }
        }

        const subTotal = cart.reduce((total, item) => {
            return total + (item.quantity * item.Product.price);
        }, 0);
        
        total = subTotal
         // Check if expired
        const coupon = await Coupon.findOne({
            where: {
                code: couponCode,
                status: "active",
                start_date: { [Op.lte]: new Date() }, // Coupon has started
                end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] }, // Not expired
            }
        });

        if (coupon) {
            if (coupon.minimum_purchase && subTotal > coupon.minimum_purchase) {
                if (coupon.usage_count <= coupon.usage_limit) {
                    // Check minimum purchase requirement
                    
                        const userUsedCoupon = await CouponUsage.findOne({
                            where: { user_id: userId, coupon_id: coupon.id }
                        });
                        if (!userUsedCoupon) {
                            //calculate discount
                            let discount = 0;
                            if (coupon.discount_type === "percentage") {
                                discount = (coupon.discount_value / 100) * subTotal;
                                if (coupon.maximum_discount && discount > coupon.maximum_discount) {
                                    discount = coupon.maximum_discount;
                                }
                            } else if (coupon.discount_type === "fixed") {
                                discount = coupon.discount_value;
                            }
                            total = Math.max(0, subTotal - discount); // Ensure total doesn't go negative
                        }

                }
            }
        }

        const resObj = {
            cart,
            subTotal,
            total
        }
        successResponse(res, resObj, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}


module.exports.applyCoupon = async (req, res, next) => {
    try {
        const userId = 5 || req.user.id ;
        const { couponCode } = req.body;
        let subTotal = 0
        let total = 0
        const cart = await Cart.findAll({
                        where: { user_id: userId },
                        include: [
                          {
                            model: User,
                            attributes: ["id", "first_name", "last_name", "email", "phone"], // User details
                            as: "User"
                          },
                          {
                            model: Product,
                            attributes: ["id", "name", "price", "discount_price", "stock_quantity"], // Product details
                            as: "Product"
                          },
                          {
                            model: Flavor,
                            attributes: ["id", "name"], // Flavor details
                            as: "Flavor"
                          }
                        ]
                      });

        if (cart.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            }
        }
            
        // Calculate total amount
        subTotal = cart.reduce((total, item) => {
            return total + (item.quantity * item.Product.price);
        }, 0);

        total = subTotal
         // Check if expired
        const coupon = await Coupon.findOne({
            where: {
                code: couponCode,
                status: "active",
                start_date: { [Op.lte]: new Date() }, // Coupon has started
                end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] }, // Not expired
            }
        });
        
        if (!coupon) {
            throw {
                statusCode: 404,
                message: 'Invalid or expired coupon code'
            }
        }

        // Check minimum purchase requirement
        if (coupon.minimum_purchase && subTotal < coupon.minimum_purchase) {
            throw {
                statusCode: 400,
                message: `Coupon requires a minimum purchase of $${coupon.minimum_purchase}.`
            }
        }

        // Check usage limit
        if (coupon.usage_count >= coupon.usage_limit) {
            throw {
                statusCode: 400,
                message: 'Coupon usage limit reached'
            }
        }

        const userUsedCoupon = await CouponUsage.findOne({
            where: { user_id: userId, coupon_id: coupon.id }
        });

        //isSingleUse
        if (coupon.is_single_use) {
            if (userUsedCoupon) {
                throw {
                    statusCode: 400,
                    message: 'You have already used this coupon.'
                }
            }
            
        }

        

        //calculate discount
        let discount = 0;
        
        if(!userUsedCoupon){
            if (coupon.discount_type === "percentage") {
                discount = (coupon.discount_value / 100) * subTotal;
                // Apply maximum discount cap if set
                if (coupon.maximum_discount && discount > coupon.maximum_discount) {
                    discount = coupon.maximum_discount;
                }
            } else if (coupon.discount_type === "fixed") {
                discount = coupon.discount_value;
            }
            total = Math.max(0, subTotal - discount); // Ensure total doesn't go negative
        }
                
        const resObj = {
            subTotal,
            total
        }
        successResponse(res, resObj, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}









// module.exports.checkoutOld = async (req, res, next) => {
//     const transaction = await Product.sequelize.transaction();
//     try {
//         const userId = 5 || req.user.id ;
//         const { couponCode } = req.body;
//         let totalPrice = 0
//         const cart = await Cart.findAll({
//                         where: { user_id: userId },
//                         include: [
//                           {
//                             model: User,
//                             attributes: ["id", "first_name", "last_name", "email", "phone"], // User details
//                             as: "User"
//                           },
//                           {
//                             model: Product,
//                             attributes: ["id", "name", "price", "discount_price", "stock_quantity"], // Product details
//                             as: "Product",
//                             include: [
//                                 {
//                                   model: Category,
//                                   attributes: ["id", "name"], // Category details
//                                   as: "Category",
//                                 },
//                                 {
//                                     model: Brand,
//                                     attributes: ["id", "name"], // Brand details
//                                     as: "Brand",
//                                   },
//                                 {
//                                     model: ProductImage,
//                                     attributes: ["id", "image_url"], // Product image details
//                                     as: "ProductImages",
//                                   },
//                               ],
//                           },
//                           {
//                             model: Flavor,
//                             attributes: ["id", "name"], // Flavor details
//                             as: "Flavor"
//                           }
//                         ]
//                       });
//         if (cart.length === 0) {
//             throw {
//                 statusCode: 404,
//                 message: 'Cart is empty'
//             }
//         }


//          // Check if expired
//         const coupon = await Coupon.findOne({
//             where: {
//                 code: couponCode,
//                 status: "active",
//                 start_date: { [Op.lte]: new Date() }, // Coupon has started
//                 end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] }, // Not expired
//             }
//         });

//         if (!coupon) {
//             throw {
//                 statusCode: 404,
//                 message: 'Invalid or expired coupon code'
//             }
//         }

//         // Check usage limit
//         if (coupon.usedCount >= coupon.usageLimit) {
//             throw {
//                 statusCode: 400,
//                 message: 'Coupon usage limit reached'
//             }
//         }

//         //isSingleUse
//         if (coupon.is_single_use) {
//             const userUsedCoupon = await CouponUsage.findOne({
//                 where: { user_id: userId, coupon_id: coupon.id }
//             });

//             if (!userUsedCoupon) {
//                 // const newCouponUsage = await CouponUsage.create({
//                 //     user_id: userId,
//                 //     coupon_id: coupon.id
//                 // });
//             }
            
//         }

//         //calculate discount
//         let discount = 0;

//         // Calculate total amount
//         totalPrice = cart.reduce((total, item) => {
//             return total + (item.quantity * item.Product.price);
//         }, 0);

//         if (coupon.discount_type === "percentage") {
//             discount = (coupon.discount_value / 100) * totalPrice;
//         } else if (coupon.discount_type === "fixed") {
//             discount = coupon.discount_value;
//         }
//         const finalAmount = Math.max(0, totalPrice - discount); // Ensure total doesn't go negative

        
//         // Process each cart item & create orders
//         const createdOrders = [];
//         for (const cartItem of cart) {
//             const product = cartItem.Product;
//             const finalPrice = cartItem.discount_price ? product.discount_price * cartItem.quantity : product.price * cartItem.quantity;
//             const order = await Order.create(
//             {
//                 user_id: userId,
//                 product_id: cartItem.Product.id,
//                 product_flavour_id: cartItem.Flavor.id,
//                 name: cartItem.Product.name,
//                 slug: cartItem.Product.slug,
//                 description: cartItem.Product.description,
//                 price: finalPrice,
//                 discount_price: cartItem.Product.discount_price,
//                 category_id: cartItem.Product.Category.id,
//                 brand_id: cartItem.Brand.id,
//                 quantity: cartItem.quantity,
//                 image_url: cartItem.Product.ProductImage.image_url,
//                 payment_gateway: null,
//                 transaction_id: null,
//                 order_status: 0, // Pending
//             },
//             { transaction: transaction }
//         );

//         createdOrders.push(order);

//         // Deduct product stock
//         await product.update(
//             { quantity: product.quantity - cartItem.quantity },
//             { transaction: transaction }
//         );
//     }
  
 // const newCouponUsage = await CouponUsage.create({
        //     user_id: userId,
        //     coupon_id: coupon.id
        // });
        // await coupon.increment("usage_count");

//         await transaction.commit();
//         successResponse(res, createdOrders, 'Order(s) created successfully');
//     } catch (error) {
//         console.log(error)
//         await transaction.rollback();
//         logger.error(error)
//         return errorResponse(res, error, error.message);
//     }
// }