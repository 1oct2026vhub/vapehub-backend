const { Op } = require("sequelize");
const moment = require("moment-timezone");
const { Coupon, CouponUsage } = require("../../../models");

/**
 * Validate a regular coupon for a specific user and calculate discount.
 *
 * This helper is intentionally focused on:
 * - Standard coupons (not referral codes)
 * - Per‑user reuse blocking via CouponUsage
 * - Single‑use and global usage_limit enforcement
 * - Minimum purchase based on subtotal
 *
 * @param {Object} options
 * @param {string} options.couponCode             Normalised coupon code (no '$undefined'/'null' strings)
 * @param {number} options.userId                User ID (temporary guest user in guest flows)
 * @param {number} options.subTotal              Subtotal before deals and coupons
 * @param {number} options.totalBeforeCoupon     Total after deals, before coupon
 * @returns {Promise<{ coupon: Object|null, discount: number }>}
 */
const validateAndCalculateCouponForUser = async ({
    couponCode,
    userId,
    subTotal,
    totalBeforeCoupon
}) => {
    if (!couponCode) {
        return { coupon: null, discount: 0 };
    }

    // Load active coupon
    const coupon = await Coupon.findOne({
        where: {
            code: couponCode,
            status: "active"
        }
    });

    if (!coupon) {
        throw {
            statusCode: 404,
            message: "Invalid or expired coupon code"
        };
    }

    // Date validity using UK timezone (aligned with rest of system)
    const currentUkTime = moment().tz(process.env.UK_TIMEZONE || "Europe/London");
    if (coupon.start_date && currentUkTime.isBefore(coupon.start_date)) {
        throw {
            statusCode: 404,
            message: "Coupon has not started yet"
        };
    }
    if (coupon.end_date && currentUkTime.isAfter(coupon.end_date)) {
        throw {
            statusCode: 404,
            message: "Coupon has expired"
        };
    }

    // Coupon restricted to a specific user
    if (coupon.coupon_user !== null && coupon.coupon_user !== userId) {
        throw {
            statusCode: 400,
            message: "This coupon is not valid for you."
        };
    }

    // Global usage limit
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
        throw {
            statusCode: 400,
            message: "This coupon is no longer available — usage limit exceeded."
        };
    }

    // Per‑user usage and single‑use behaviour – only meaningful when we have a userId
    if (userId) {
        const userUsedCoupon = await CouponUsage.findOne({
            where: { user_id: userId, coupon_id: coupon.id }
        });

        if (userUsedCoupon) {
            throw {
                statusCode: 400,
                message: "You have already used this coupon."
            };
        }

        if (coupon.is_single_use) {
            const singleUsedCoupon = await CouponUsage.findOne({
                where: { coupon_id: coupon.id }
            });
            if (singleUsedCoupon) {
                throw {
                    statusCode: 400,
                    message: "This coupon is no longer available — usage limit exceeded."
                };
            }
        }
    }

    // Minimum purchase requirement based on subtotal
    if (
        parseFloat(coupon.minimum_purchase) &&
        parseFloat(subTotal) < parseFloat(coupon.minimum_purchase)
    ) {
        throw {
            statusCode: 400,
            message: `Coupon requires a minimum purchase of £${coupon.minimum_purchase}.`
        };
    }

    // For now, guest combined checkout does not support entity‑restricted coupons;
    // we apply the discount on the whole cart totalBeforeCoupon.
    let discount = 0;
    if (coupon.discount_type === "percentage") {
        discount = (parseFloat(coupon.discount_value) / 100) * totalBeforeCoupon;
    } else if (coupon.discount_type === "fixed_amount") {
        discount = parseFloat(coupon.discount_value);
    }

    // Apply maximum discount limit
    if (
        parseFloat(discount) &&
        parseFloat(coupon.maximum_discount) &&
        parseFloat(discount) > parseFloat(coupon.maximum_discount)
    ) {
        discount = parseFloat(coupon.maximum_discount);
    }

    // Ensure discount does not exceed totalBeforeCoupon
    if (parseFloat(discount) > parseFloat(totalBeforeCoupon)) {
        discount = totalBeforeCoupon;
    }

    // Round to 2 decimals
    discount = parseFloat(Math.max(0, discount).toFixed(2));

    return { coupon, discount };
};

module.exports = {
    validateAndCalculateCouponForUser
};

