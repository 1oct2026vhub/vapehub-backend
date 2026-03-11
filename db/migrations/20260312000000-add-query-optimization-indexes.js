'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const noop = () => {};
        // order_items — used in trending/order count queries
        await queryInterface.addIndex('order_items', ['product_id', 'variant_id'], { name: 'idx_oi_product_variant' }).catch(noop);
        // reviews — filtered by product_id + is_visible
        await queryInterface.addIndex('reviews', ['product_id', 'is_visible', 'deleted_at'], { name: 'idx_reviews_product_visible' }).catch(noop);
        // product_attribute_terms — filtered by product_id + attribute_id
        await queryInterface.addIndex('product_attribute_terms', ['product_id', 'attribute_id', 'deleted_at'], { name: 'idx_pat_product_attr_deleted' }).catch(noop);
        // product_variant_attributes — filtered by variant_id
        await queryInterface.addIndex('product_variant_attributes', ['variant_id', 'attribute_id'], { name: 'idx_pva_variant_attr' }).catch(noop);
        // product_variant_images — filtered by variant_id
        await queryInterface.addIndex('product_variant_images', ['variant_id', 'deleted_at'], { name: 'idx_pvi_variant_deleted' }).catch(noop);
        // product_images — filtered by product_id
        await queryInterface.addIndex('product_images', ['product_id', 'is_primary'], { name: 'idx_pi_product_primary' }).catch(noop);
        // slug_relations — queried by slug
        await queryInterface.addIndex('slug_relations', ['slug', 'entity_type'], { name: 'idx_slug_entity' }).catch(noop);
        // orders — used in date range queries
        await queryInterface.addIndex('orders', ['status', 'createdAt', 'deletedAt'], { name: 'idx_orders_status_created' }).catch(noop);
    },

    down: async (queryInterface, Sequelize) => {
        const noop = () => {};
        const indexTablePairs = [
            ['order_items', 'idx_oi_product_variant'],
            ['reviews', 'idx_reviews_product_visible'],
            ['product_attribute_terms', 'idx_pat_product_attr_deleted'],
            ['product_variant_attributes', 'idx_pva_variant_attr'],
            ['product_variant_images', 'idx_pvi_variant_deleted'],
            ['product_images', 'idx_pi_product_primary'],
            ['slug_relations', 'idx_slug_entity'],
            ['orders', 'idx_orders_status_created']
        ];
        for (const [table, indexName] of indexTablePairs) {
            await queryInterface.removeIndex(table, indexName).catch(noop);
        }
    }
};
