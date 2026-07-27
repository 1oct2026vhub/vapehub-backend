'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const noop = () => {};
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t));
    const tableExists = tableNames.includes('abandoned_cart_flows');

    if (!tableExists) {
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
            'failed',
            'superseded'
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
    }

    // order_id uniqueness comes from column unique: true — do not add a second unique index
    await queryInterface.addIndex('abandoned_cart_flows', ['status'], {
      name: 'idx_abandoned_cart_flows_status'
    }).catch(noop);
    await queryInterface.addIndex('abandoned_cart_flows', ['first_email_sent_at'], {
      name: 'idx_abandoned_cart_flows_email1'
    }).catch(noop);
    await queryInterface.addIndex('abandoned_cart_flows', ['second_email_sent_at'], {
      name: 'idx_abandoned_cart_flows_email2'
    }).catch(noop);
    await queryInterface.addIndex('abandoned_cart_flows', ['cancelled_at'], {
      name: 'idx_abandoned_cart_flows_cancelled_at'
    }).catch(noop);
    await queryInterface.addIndex('abandoned_cart_flows', ['recovered_at'], {
      name: 'idx_abandoned_cart_flows_recovered_at'
    }).catch(noop);
    await queryInterface.addIndex('abandoned_cart_flows', ['createdAt'], {
      name: 'idx_abandoned_cart_flows_created_at'
    }).catch(noop);
  },

  async down(queryInterface) {
    const noop = () => {};
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_status').catch(noop);
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_email1').catch(noop);
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_email2').catch(noop);
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_cancelled_at').catch(noop);
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_recovered_at').catch(noop);
    await queryInterface.removeIndex('abandoned_cart_flows', 'idx_abandoned_cart_flows_created_at').catch(noop);
    await queryInterface.dropTable('abandoned_cart_flows').catch(noop);
  }
};
