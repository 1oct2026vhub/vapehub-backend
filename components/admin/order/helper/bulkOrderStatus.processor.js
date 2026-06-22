const {
    Order,
    OrderItem,
    User,
    Product,
    ProductVariant,
    ProductVariantAttribute,
    Attribute,
    AttributeTerm,
    ShippingMethod,
    OrderAddress,
    sequelize,
} = require('../../../../models');
const { Op } = require('sequelize');
const { orderStatus } = require('../../../../config/constants');
const { createNotification } = require('../../../notification/helper/notification.helper');
const { createShipStationOrder } = require('../../shipStation/domain/shipStation.controller');

const LOCK_ATTRIBUTES = ['id', 'status', 'shipstation_order_id', 'order_unique_id', 'user_id'];

const BULK_ORDER_INCLUDES = [
    {
        model: User,
        as: 'user',
        attributes: ['id', 'first_name', 'last_name', 'email'],
        paranoid: false
    },
    {
        model: OrderItem,
        as: 'orderItems',
        attributes: ['id', 'product_id', 'variant_id', 'quantity', 'unit_price', 'unit'],
        include: [
            {
                model: Product,
                as: 'product',
                paranoid: false,
                attributes: ['id', 'name', 'sku', 'slug']
            },
            {
                model: ProductVariant,
                as: 'variant',
                paranoid: false,
                attributes: ['id', 'stock', 'sku', 'slug', 'weight'],
                include: [
                    {
                        model: ProductVariantAttribute,
                        as: 'variantAttributes',
                        paranoid: false,
                        attributes: ['id', 'variant_id', 'attribute_id', 'term_id'],
                        include: [
                            {
                                model: Attribute,
                                as: 'attribute',
                                paranoid: false,
                                attributes: ['id', 'name']
                            },
                            {
                                model: AttributeTerm,
                                as: 'term',
                                paranoid: false,
                                attributes: ['id', 'attribute_id', 'name']
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        model: ShippingMethod,
        as: 'shippingMethod',
        attributes: ['id', 'shipping_method', 'shipping_cost', 'service_code', 'carrier_code', 'requestedShippingService']
    },
    {
        model: OrderAddress,
        as: 'orderShippingAddress',
        attributes: ['id', 'name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone']
    },
    {
        model: OrderAddress,
        as: 'orderBillingAddress',
        attributes: ['id', 'name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone']
    }
];

function getOrderCustomerEmail(order) {
    return order.user?.email || order.email || null;
}

function buildShipstationData(shipStationResponse, shipstationOrderId) {
    const orderId = shipStationResponse?.orderResponse?.orderId || shipstationOrderId;
    if (!orderId) {
        return null;
    }

    return {
        order_id: orderId,
        label_data: shipStationResponse?.labelResponse ? {
            shipment_id: shipStationResponse.labelResponse.shipmentId,
            tracking_number: shipStationResponse.labelResponse.trackingNumber,
            shipment_cost: shipStationResponse.labelResponse.shipmentCost
        } : null
    };
}

function buildSkippedResult(row, status, shipstationData = null) {
    return {
        success: true,
        skipped: true,
        order_id: row.id,
        order_unique_id: row.order_unique_id,
        status,
        message: 'Order already has the target status',
        shipstation_data: shipstationData,
    };
}

async function safeRollback(transaction) {
    if (transaction && !transaction.finished) {
        await transaction.rollback();
    }
}

async function loadOrderForStatusUpdate(orderId) {
    return Order.findByPk(orderId, { include: BULK_ORDER_INCLUDES });
}

async function claimOrderRow(orderId, transaction) {
    return Order.findByPk(orderId, {
        attributes: LOCK_ATTRIBUTES,
        lock: transaction.LOCK.UPDATE,
        transaction,
    });
}

async function loadOrderStateFromDb(orderId) {
    return Order.findByPk(orderId, {
        attributes: LOCK_ATTRIBUTES,
    });
}

function applyOrderStateToInstance(order, stateRow) {
    if (!order || !stateRow) {
        return;
    }
    order.status = stateRow.status;
    order.shipstation_order_id = stateRow.shipstation_order_id;
    order.order_unique_id = stateRow.order_unique_id;
    order.user_id = stateRow.user_id;
}

function isOrderAlreadyProcessedForTarget(order, targetStatus) {
    if (!order || !targetStatus) {
        return false;
    }
    if (order.status === targetStatus) {
        return true;
    }
    if (targetStatus === orderStatus.PACKED && order.shipstation_order_id) {
        return true;
    }
    return false;
}

async function processOrderStatusUpdate({
    orderId,
    status,
    userId,
    createLabel = true,
    order: preloadedOrder = null,
}) {
    let order = preloadedOrder;

    if (!order) {
        order = await loadOrderForStatusUpdate(orderId);
    }

    if (!order) {
        return {
            success: false,
            skipped: false,
            order_id: orderId,
            error: 'Order not found',
        };
    }

    const freshState = await loadOrderStateFromDb(orderId);
    if (!freshState) {
        return {
            success: false,
            skipped: false,
            order_id: orderId,
            error: 'Order not found',
        };
    }

    applyOrderStateToInstance(order, freshState);

    if (isOrderAlreadyProcessedForTarget(freshState, status)) {
        return {
            ...buildSkippedResult(
                freshState,
                status,
                buildShipstationData(null, freshState.shipstation_order_id)
            ),
            message: freshState.status === status
                ? 'Order already has the target status'
                : 'Order already sent to ShipStation (duplicate status update)',
        };
    }

    let shipStationResponse = null;

    if (status === orderStatus.PACKED) {
        const claimTx = await sequelize.transaction();
        let needsShipStationCreate = false;

        try {
            const claim = await claimOrderRow(orderId, claimTx);

            if (!claim) {
                await claimTx.commit();
                return {
                    success: false,
                    skipped: false,
                    order_id: orderId,
                    error: 'Order not found',
                };
            }

            if (claim.status === status) {
                await claimTx.commit();
                return buildSkippedResult(
                    claim,
                    status,
                    buildShipstationData(null, claim.shipstation_order_id)
                );
            }

            if (claim.shipstation_order_id) {
                order.shipstation_order_id = claim.shipstation_order_id;
                shipStationResponse = { orderResponse: { orderId: claim.shipstation_order_id } };
                await claimTx.commit();
            } else {
                await claimTx.commit();
                needsShipStationCreate = true;
            }
        } catch (err) {
            await safeRollback(claimTx);
            throw err;
        }

        if (needsShipStationCreate) {
            if (!getOrderCustomerEmail(order)) {
                return {
                    success: false,
                    skipped: false,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    error: 'Invalid order data: missing customer email',
                    status: order.status,
                };
            }

            try {
                shipStationResponse = await createShipStationOrder(order, { createLabel });
                const ssOrderId = shipStationResponse?.orderResponse?.orderId;
                if (ssOrderId) {
                    order.shipstation_order_id = ssOrderId;
                }
            } catch (shipStationError) {
                const errorMsg = shipStationError.message || shipStationError.toString();
                return {
                    success: false,
                    skipped: false,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    error: `Failed to create ShipStation order: ${errorMsg}`,
                    status: order.status,
                };
            }
        }
    }

    const transaction = await sequelize.transaction();
    try {
        const locked = await claimOrderRow(orderId, transaction);

        if (!locked) {
            await transaction.commit();
            return {
                success: false,
                skipped: false,
                order_id: orderId,
                error: 'Order not found',
            };
        }

        if (locked.status === status) {
            await transaction.commit();
            return buildSkippedResult(
                locked,
                status,
                buildShipstationData(shipStationResponse, locked.shipstation_order_id)
            );
        }

        await locked.update({
            status,
            updated_by: userId
        }, {
            isAdmin: true,
            userId: userId,
            transaction
        });

        if (status === orderStatus.CANCEL) {
            for (const item of order.orderItems || []) {
                if (item.variant) {
                    await item.variant.increment('stock', {
                        by: item.quantity,
                        transaction
                    });
                }
            }
        }

        await transaction.commit();

        await createNotification({
            userId: locked.user_id,
            type: 'system',
            action: 'alert',
            data: {
                message: `Your order #${locked.order_unique_id} status has been updated to ${status}`
            },
            title: 'Order Status Updated',
            url: `/order-details/${locked.id}`
        });

        return {
            success: true,
            skipped: false,
            order_id: locked.id,
            order_unique_id: locked.order_unique_id,
            status,
            shipstation_data: buildShipstationData(shipStationResponse, locked.shipstation_order_id),
        };
    } catch (orderError) {
        await safeRollback(transaction);
        return {
            success: false,
            skipped: false,
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            error: orderError.message,
            status: order.status,
        };
    }
}

async function loadOrdersForStatusUpdate(orderIds) {
    return Order.findAll({
        where: { id: { [Op.in]: orderIds } },
        include: BULK_ORDER_INCLUDES
    });
}

module.exports = {
    BULK_ORDER_INCLUDES,
    loadOrderForStatusUpdate,
    loadOrdersForStatusUpdate,
    processOrderStatusUpdate,
    getOrderCustomerEmail,
    isOrderAlreadyProcessedForTarget,
    loadOrderStateFromDb,
};

