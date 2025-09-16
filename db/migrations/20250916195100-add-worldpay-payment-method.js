'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, check if Worldpay already exists in PaymentMethods
    const [worldpay] = await queryInterface.sequelize.query(
      `SELECT id FROM PaymentMethods WHERE payment_method = 'Worldpay' LIMIT 1;`
    );

    if (worldpay.length === 0) {
      // If Worldpay doesn't exist, create it
      await queryInterface.sequelize.query(
        `INSERT INTO PaymentMethods (payment_method, status, createdAt, updatedAt) 
         VALUES ('Worldpay', 'active', NOW(), NOW());`
      );
      
      console.log('✅ Worldpay payment method added successfully');
    } else {
      console.log('ℹ️  Worldpay payment method already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove Worldpay payment method
    await queryInterface.sequelize.query(
      `DELETE FROM PaymentMethods WHERE payment_method = 'Worldpay';`
    );
    
    console.log('🗑️  Worldpay payment method removed');
  }
};
