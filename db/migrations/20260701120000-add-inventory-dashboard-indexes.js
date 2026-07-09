'use strict';

/**
 * Indexes for admin inventory dashboard / stock queries:
 * - orders filtered by status + updatedAt (28-day / last-month sales)
 * - order_items joined by variant_id + order_id (sales aggregates)
 * - product_variants low-stock filter (stock vs low_stock_threshold)
 *
 * idx_order_items_variant_order may already exist from 20260617000000-add-admin-order-list-indexes.
 */
module.exports = {
    up: async (queryInterface) => {
        const noop = () => {};

        await queryInterface.addIndex('orders', ['status', 'updatedAt'], {
            name: 'idx_orders_status_updated_at',
        }).catch(noop);

        await queryInterface.addIndex('order_items', ['variant_id', 'order_id'], {
            name: 'idx_order_items_variant_order',
        }).catch(noop);

        await queryInterface.addIndex('product_variants', ['stock', 'low_stock_threshold', 'deleted_at'], {
            name: 'idx_product_variants_inventory_stock',
        }).catch(noop);
    },

    down: async (queryInterface) => {
        const noop = () => {};
        const indexTablePairs = [
            ['orders', 'idx_orders_status_updated_at'],
            ['order_items', 'idx_order_items_variant_order'],
            ['product_variants', 'idx_product_variants_inventory_stock'],
        ];
        for (const [table, indexName] of indexTablePairs) {
            await queryInterface.removeIndex(table, indexName).catch(noop);
        }
    },
};
