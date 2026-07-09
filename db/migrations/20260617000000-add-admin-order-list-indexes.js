'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    up: async (queryInterface) => {
        const noop = () => {};

        // Default admin list: ORDER BY createdAt DESC with soft-delete filter
        await queryInterface.addIndex('orders', ['createdAt', 'deletedAt'], {
            name: 'idx_orders_created_deleted'
        }).catch(noop);

        // Search filter: user_id IN (...)
        await queryInterface.addIndex('orders', ['user_id'], {
            name: 'idx_orders_user_id'
        }).catch(noop);

        // separate: true orderItems load: WHERE order_id IN (...)
        await queryInterface.addIndex('order_items', ['order_id'], {
            name: 'idx_order_items_order_id'
        }).catch(noop);

        // Product filter: GROUP BY order_id on product_id / variant_id
        await queryInterface.addIndex('order_items', ['product_id', 'order_id'], {
            name: 'idx_order_items_product_order'
        }).catch(noop);
        await queryInterface.addIndex('order_items', ['variant_id', 'order_id'], {
            name: 'idx_order_items_variant_order'
        }).catch(noop);
    },

    down: async (queryInterface) => {
        const noop = () => {};
        const indexTablePairs = [
            ['orders', 'idx_orders_created_deleted'],
            ['orders', 'idx_orders_user_id'],
            ['order_items', 'idx_order_items_order_id'],
            ['order_items', 'idx_order_items_product_order'],
            ['order_items', 'idx_order_items_variant_order']
        ];
        for (const [table, indexName] of indexTablePairs) {
            await queryInterface.removeIndex(table, indexName).catch(noop);
        }
    }
};
