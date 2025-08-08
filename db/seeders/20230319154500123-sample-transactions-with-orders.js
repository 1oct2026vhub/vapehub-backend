const { Order, Transaction } = require('../../models');
const constants = require('../../config/constants');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return;
    const orders = await Order.findAll({ attributes: ['id', 'user_id'] });
    let transactionsData = [];

    orders.forEach(order => {
      const transaction = {
        userId: order.user_id,
        orderId: order.id,
        paymentMethod: constants.paymentMethodEnums[Math.floor(Math.random() * constants.paymentMethodEnums.length)],
        transactionType: constants.transactionTypeEnums[Math.floor(Math.random() * constants.transactionTypeEnums.length)],
        amount: (Math.random() * 1000).toFixed(2),
        currency: 'GBP',
        status: constants.transactionStatusEnums[Math.floor(Math.random() * constants.transactionStatusEnums.length)],
        referenceNumber: `REF${Math.floor(Math.random() * 1000000000)}`,
        notes: 'Sample transaction',
        metadata: JSON.stringify({ key: 'value' }),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      transactionsData.push(transaction);
    });

    await queryInterface.bulkInsert('transactions', transactionsData, {
      ignoreDuplicates: true
    });

    console.log('Inserted transactions:', transactionsData);
  },

  down: async (queryInterface, Sequelize) => {
    return;
    await queryInterface.bulkDelete('transactions', null, {});
  }
}; 