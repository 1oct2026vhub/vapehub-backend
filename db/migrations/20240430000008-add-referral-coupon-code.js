'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Check if column already exists
      const tableInfo = await queryInterface.describeTable('referrals');
      const columnExists = tableInfo.hasOwnProperty('referral_coupon_code');

      if (!columnExists) {
        // Add the referral_coupon_code column
        await queryInterface.addColumn('referrals', 'referral_coupon_code', {
          type: Sequelize.STRING(10),
          allowNull: true,
          after: 'referral_code'
        });

        // Generate and update referral_coupon_code for existing records
        const referrals = await queryInterface.sequelize.query(
          'SELECT id FROM referrals WHERE referral_coupon_code IS NULL',
          { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        for (const referral of referrals) {
          const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let code = '';
          for (let i = 0; i < 7; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
          }

          await queryInterface.sequelize.query(
            'UPDATE referrals SET referral_coupon_code = ? WHERE id = ?',
            {
              replacements: [code, referral.id],
              type: queryInterface.sequelize.QueryTypes.UPDATE
            }
          );
        }

        // Add NOT NULL constraint
        await queryInterface.changeColumn('referrals', 'referral_coupon_code', {
          type: Sequelize.STRING(10),
          allowNull: false
        });

        // Add unique constraint
        await queryInterface.addIndex('referrals', ['referral_coupon_code'], {
          unique: true,
          name: 'referrals_referral_coupon_code_unique'
        });
      } else {
        console.log('Column referral_coupon_code already exists in referrals table');
      }
    } catch (error) {
      console.error('Migration Error:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Check if column exists before trying to remove it
      const tableInfo = await queryInterface.describeTable('referrals');
      const columnExists = tableInfo.hasOwnProperty('referral_coupon_code');

      if (columnExists) {
        // Remove unique constraint
        await queryInterface.removeIndex('referrals', 'referrals_referral_coupon_code_unique');
        
        // Remove the column
        await queryInterface.removeColumn('referrals', 'referral_coupon_code');
      } else {
        console.log('Column referral_coupon_code does not exist in referrals table');
      }
    } catch (error) {
      console.error('Migration Error:', error);
      throw error;
    }
  }
}; 