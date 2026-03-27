'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abandoned_cart_flows', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true,
        references: {
          model: 'orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      coupon_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'coupons',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      order_unique_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customer_email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      first_email_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      second_email_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      second_discount_code: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      recovered_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      recovered_revenue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null
      },
      status: {
        type: Sequelize.ENUM(
          'entered',
          'email1_sent',
          'email2_sent',
          'recovered',
          'cancelled',
          'failed'
        ),
        allowNull: false,
        defaultValue: 'entered'
      },
      last_error: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    await queryInterface.addIndex('abandoned_cart_flows', ['order_id'], {
      name: 'idx_abandoned_cart_flows_order_id',
      unique: true
    });
    await queryInterface.addIndex('abandoned_cart_flows', ['status'], {
      name: 'idx_abandoned_cart_flows_status'
    });
    await queryInterface.addIndex('abandoned_cart_flows', ['first_email_sent_at'], {
      name: 'idx_abandoned_cart_flows_email1'
    });
    await queryInterface.addIndex('abandoned_cart_flows', ['second_email_sent_at'], {
      name: 'idx_abandoned_cart_flows_email2'
    });
    await queryInterface.addIndex('abandoned_cart_flows', ['cancelled_at'], {
      name: 'idx_abandoned_cart_flows_cancelled_at'
    });
    await queryInterface.addIndex('abandoned_cart_flows', ['recovered_at'], {
      name: 'idx_abandoned_cart_flows_recovered_at'
    });
    await queryInterface.addIndex('abandoned_cart_flows', ['createdAt'], {
      name: 'idx_abandoned_cart_flows_created_at'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_order_id');
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_status');
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_email1');
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_email2');
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_cancelled_at');
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_recovered_at');
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_created_at');
    await queryInterface.dropTable('abandoned_cart_flows');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_abandoned_cart_flows_status";');
  }
};
