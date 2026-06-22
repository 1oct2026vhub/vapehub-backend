const { ShippingMethod } = require('../../../../models');

let cachedFallbackMethod = null;
let cachedFallbackLoadedAt = 0;
const FALLBACK_CACHE_MS = 60_000;

function pickNonEmpty(...values) {
    for (const value of values) {
        if (value != null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }
    return null;
}

async function loadFallbackShippingMethod() {
    const now = Date.now();
    if (cachedFallbackMethod && now - cachedFallbackLoadedAt < FALLBACK_CACHE_MS) {
        return cachedFallbackMethod;
    }

    const configuredId = Number(process.env.SHIPSTATION_FALLBACK_SHIPPING_METHOD_ID || 1);
    let fallback = await ShippingMethod.findOne({
        where: {
            id: configuredId,
            deletedAt: null,
            is_enabled: true,
        },
        attributes: ['id', 'shipping_method', 'carrier_code', 'service_code', 'requestedShippingService'],
    });

    if (!fallback) {
        fallback = await ShippingMethod.findOne({
            where: {
                deletedAt: null,
                is_enabled: true,
            },
            attributes: ['id', 'shipping_method', 'carrier_code', 'service_code', 'requestedShippingService'],
            order: [['method_order', 'ASC']],
        });
    }

    cachedFallbackMethod = fallback;
    cachedFallbackLoadedAt = now;
    return fallback;
}

/**
 * Resolve ShipStation carrier/service codes for an order.
 * Inherits missing fields from the canonical fallback shipping method (default id 1).
 */
async function resolveShipStationShippingMapping(order) {
    const method = order.shippingMethod || null;
    const fallback = await loadFallbackShippingMethod();

    const methodCarrier = pickNonEmpty(method?.carrier_code);
    const methodService = pickNonEmpty(method?.service_code);
    const methodHasCompleteCodes = Boolean(methodCarrier && methodService);

    const carrierCode = pickNonEmpty(methodCarrier, fallback?.carrier_code);
    const serviceCode = pickNonEmpty(methodService, fallback?.service_code);
    const requestedShippingService = pickNonEmpty(
        method?.requestedShippingService,
        methodHasCompleteCodes ? method?.shipping_method : null,
        fallback?.requestedShippingService,
        fallback?.shipping_method,
        'Standard Delivery'
    );

    const usedFallback =
        !methodHasCompleteCodes ||
        (!pickNonEmpty(method?.requestedShippingService) &&
            pickNonEmpty(fallback?.requestedShippingService));

    if (!carrierCode || !serviceCode) {
        const methodLabel = method
            ? `shipping method id ${method.id} (${method.shipping_method || 'unknown'})`
            : 'no shipping method on order';
        throw new Error(
            `Missing ShipStation carrier/service mapping for ${methodLabel}. ` +
            'Set carrier_code and service_code on the shipping method or configure SHIPSTATION_FALLBACK_SHIPPING_METHOD_ID.'
        );
    }

    return {
        carrierCode,
        serviceCode,
        requestedShippingService,
        usedFallback: Boolean(usedFallback),
        fallbackMethodId: fallback?.id || null,
    };
}

function clearFallbackShippingMethodCache() {
    cachedFallbackMethod = null;
    cachedFallbackLoadedAt = 0;
}

module.exports = {
    resolveShipStationShippingMapping,
    clearFallbackShippingMethodCache,
    pickNonEmpty,
};
