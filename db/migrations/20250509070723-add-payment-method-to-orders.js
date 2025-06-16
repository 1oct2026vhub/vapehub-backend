'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, ensure VivaWallet exists in PaymentMethods
    const [vivaWallet] = await queryInterface.sequelize.query(
      `SELECT id FROM PaymentMethods WHERE payment_method = 'VivaWallet' LIMIT 1;`
    );

    let vivaWalletId;
    if (vivaWallet.length === 0) {
      // If VivaWallet doesn't exist, create it
      const [result] = await queryInterface.sequelize.query(
        `INSERT INTO PaymentMethods (payment_method, status, createdAt, updatedAt) 
         VALUES ('VivaWallet', 'active', NOW(), NOW());`
      );
      
      // Get the inserted ID
      const [inserted] = await queryInterface.sequelize.query(
        `SELECT LAST_INSERT_ID() as id;`
      );
      vivaWalletId = inserted[0].id;
    } else {
      vivaWalletId = vivaWallet[0].id;
    }

    // Add the column with default value
    await queryInterface.addColumn('orders', 'payment_method_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: vivaWalletId,
      references: {
        model: 'PaymentMethods',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('orders', 'payment_method_id');
  }
}; 