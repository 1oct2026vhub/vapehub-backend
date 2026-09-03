const {
    Order,
    OrderItem,
    OrderAddress,
    UserAddress,
    PaymentMethod,
    ProductVariant,
    sequelize
} = require('../../../models');
const constants = require('../../../config/constants');
const { generateTransactionReference } = require('./worldpay.helper');
const { ensurePendingWorldpayTransaction } = require('../../payment/helper/worldpayPendingTransaction.helper');

const RETRYABLE_STATUSES = ['pending'];

const mapAddressToWorldpayBilling = (addr = {}) => ({
    first_name: addr.name || addr.first_name,
    address_line_1: addr.street || addr.address_line_1,
    address_line_2: addr.apartment || addr.address_line_2 || '',
    city: addr.town || addr.city,
    region: addr.region,
    post_code: addr.post_code,
    country: addr.country || 'GB'
});

const retryOrderPaymentLogic = async (userId, orderId, transaction) => {
    const order = await Order.findOne({
        where: { id: orderId, user_id: userId },
        include: [
            { model: OrderItem, as: 'orderItems' },
            { model: OrderAddress, as: 'orderBillingAddress' },
            { model: OrderAddress, as: 'orderShippingAddress' },
            { model: UserAddress, as: 'billingAddress' },
            { model: UserAddress, as: 'shippingAddress' },
            { model: PaymentMethod, as: 'paymentMethod' }
        ],
        lock: transaction.LOCK.UPDATE,
        transaction
    });

    if (!order) {
        const error = new Error('Order not found');
        error.statusCode = 404;
        throw error;
    }

    if (order.ordered) {
        const error = new Error('Order is already paid');
        error.statusCode = 400;
        throw error;
    }

    if (!RETRYABLE_STATUSES.includes(order.status)) {
        const error = new Error(`Order cannot be retried from status '${order.status}'`);
        error.statusCode = 400;
        throw error;
    }

    const amount = parseFloat(order.total);
    if (!(amount > 0)) {
        const error = new Error('Payment is not required for this order');
        error.statusCode = 400;
        throw error;
    }

    if (!order.orderItems || order.orderItems.length === 0) {
        const error = new Error('Order has no items to pay for');
        error.statusCode = 400;
        throw error;
    }

    const existingTxn = await sequelize.models.Transaction.findOne({
        where: { orderId: order.id, userId },
        transaction,
        lock: transaction.LOCK.UPDATE
    });

    if (existingTxn?.status === constants.transactionStatus.COMPLETED) {
        const error = new Error('Order is already paid');
        error.statusCode = 400;
        throw error;
    }

    for (const item of order.orderItems) {
        if (!item.variant_id) continue;
        const variant = await ProductVariant.findByPk(item.variant_id, { transaction });
        if (!variant || item.quantity > variant.stock) {
            const error = new Error('One or more items are out of stock');
            error.statusCode = 400;
            throw error;
        }
    }

    const payMethod = order.paymentMethod?.payment_method;
    if (payMethod && payMethod !== 'Worldpay') {
        const error = new Error(`Retry is not supported for ${payMethod} payment method`);
        error.statusCode = 400;
        throw error;
    }

    const billing =
        order.orderBillingAddress ||
        order.billingAddress ||
        order.orderShippingAddress ||
        order.shippingAddress;

    if (!billing) {
        const error = new Error('Order billing address is missing');
        error.statusCode = 400;
        throw error;
    }

    let countryCode = (billing.country || 'GB').toUpperCase();
    if (countryCode.length !== 2) {
        countryCode = 'GB';
    }

    const orderCode = generateTransactionReference();

    await order.update(
        {
            order_code: orderCode
        },
        { transaction }
    );

    await ensurePendingWorldpayTransaction({
        userId,
        orderId: order.id,
        orderCode,
        amount,
        currency: 'GBP',
        dbTransaction: transaction
    });

    return {
        order_code: orderCode,
        worldpay_url: null,
        reused_pending_order: true,
        retried_existing_order: true,
        is_payment_required: true,
        payment_required: true,
        order_details: {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            order_code: orderCode,
            status: 'pending',
            total: amount
        },
        worldpayCheckoutRequest: {
            transactionReference: orderCode,
            calculatedTotal: amount,
            billingAddrForPayment: mapAddressToWorldpayBilling(billing),
            countryCode,
            logContext: {
                userId,
                orderId: order.id,
                retriedExistingOrder: true
            }
        }
    };
};

module.exports = {
    retryOrderPaymentLogic
};
