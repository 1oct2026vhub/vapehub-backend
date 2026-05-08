'use strict';

/**
 * Adds `superseded` to abandoned_cart_flows.status (MySQL ENUM).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE abandoned_cart_flows
      MODIFY COLUMN status ENUM(
        'entered',
        'email1_sent',
        'email2_sent',
        'recovered',
        'cancelled',
        'failed',
        'superseded'
      ) NOT NULL DEFAULT 'entered'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE abandoned_cart_flows
      SET status = 'cancelled'
      WHERE status = 'superseded'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE abandoned_cart_flows
      MODIFY COLUMN status ENUM(
        'entered',
        'email1_sent',
        'email2_sent',
        'recovered',
        'cancelled',
        'failed'
      ) NOT NULL DEFAULT 'entered'
    `);
  }
};
