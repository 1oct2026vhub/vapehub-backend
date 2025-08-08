'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    return;
    try {
      const { sequelize } = queryInterface;
      console.log('Starting order data cleanup...');

      // 1. Find orders without transactions
      const ordersWithoutTransactions = await sequelize.query(`
        SELECT o.id, o.order_unique_id, o.status, o.total 
        FROM orders o 
        LEFT JOIN transactions t ON o.id = t.orderId 
        WHERE t.id IS NULL
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`Found ${ordersWithoutTransactions.length} orders without transactions`);

      // 2. Find transactions without orders
      const transactionsWithoutOrders = await sequelize.query(`
        SELECT t.id, t.referenceNumber as transaction_id, t.amount 
        FROM transactions t 
        LEFT JOIN orders o ON t.orderId = o.id 
        WHERE o.id IS NULL
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`Found ${transactionsWithoutOrders.length} transactions without associated orders`);

      // 3. Find order items without orders
      const orderItemsWithoutOrders = await sequelize.query(`
        SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id 
        FROM order_items oi 
        LEFT JOIN orders o ON oi.order_id = o.id 
        WHERE o.id IS NULL
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`Found ${orderItemsWithoutOrders.length} order items without associated orders`);

      // 4. Find orders without order items
      const ordersWithoutItems = await sequelize.query(`
        SELECT o.id, o.order_unique_id, o.status 
        FROM orders o 
        LEFT JOIN order_items oi ON o.id = oi.order_id 
        WHERE oi.id IS NULL
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`Found ${ordersWithoutItems.length} orders without any items`);

      // Start cleanup process
    //   await sequelize.transaction(async (transaction) => {
    //     // 1. Permanently delete transactions without orders
    //     if (transactionsWithoutOrders.length > 0) {
    //       await sequelize.query(`
    //         DELETE IGNORE FROM transactions 
    //         WHERE id IN (${transactionsWithoutOrders.map(t => t.id).join(',')})
    //       `, { transaction });
    //       console.log(`Permanently deleted ${transactionsWithoutOrders.length} orphaned transactions`);
    //     }

    //     // 2. Permanently delete order items without orders
    //     if (orderItemsWithoutOrders.length > 0) {
    //       await sequelize.query(`
    //         DELETE IGNORE FROM order_items 
    //         WHERE id IN (${orderItemsWithoutOrders.map(oi => oi.id).join(',')})
    //       `, { transaction });
    //       console.log(`Permanently deleted ${orderItemsWithoutOrders.length} orphaned order items`);
    //     }

    //     // 3. Permanently delete orders without transactions (first delete their order items)
    //     if (ordersWithoutTransactions.length > 0) {
    //       // First permanently delete associated order items
    //       await sequelize.query(`
    //         DELETE IGNORE FROM order_items 
    //         WHERE order_id IN (${ordersWithoutTransactions.map(o => o.id).join(',')})
    //       `, { transaction });
    //       console.log(`Permanently deleted order items for ${ordersWithoutTransactions.length} orders without transactions`);

    //       // Then permanently delete the orders
    //       await sequelize.query(`
    //         DELETE IGNORE FROM orders 
    //         WHERE id IN (${ordersWithoutTransactions.map(o => o.id).join(',')})
    //       `, { transaction });
    //       console.log(`Permanently deleted ${ordersWithoutTransactions.length} orders without transactions`);
    //     }

    //     // 4. Permanently delete orders without items
    //     if (ordersWithoutItems.length > 0) {
    //       // First, permanently delete any associated transactions
    //       await sequelize.query(`
    //         DELETE IGNORE FROM transactions 
    //         WHERE orderId IN (${ordersWithoutItems.map(o => o.id).join(',')})
    //       `, { transaction });

    //       // Then permanently delete the orders
    //       await sequelize.query(`
    //         DELETE IGNORE FROM orders 
    //         WHERE id IN (${ordersWithoutItems.map(o => o.id).join(',')})
    //       `, { transaction });
    //       console.log(`Permanently deleted ${ordersWithoutItems.length} orders without items`);
    //     }
    //   });

      console.log('Order data cleanup completed successfully');
    } catch (error) {
      console.error('Error during order data cleanup:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    return;
    // This seeder cannot be undone as it's a cleanup operation
    console.log('This seeder cannot be undone as it\'s a cleanup operation');
  }
}; 