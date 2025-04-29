'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('menus', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      label: {
        type: Sequelize.STRING,
        allowNull: false
      },
      menu_parent: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'menus',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      original: {
        type: Sequelize.STRING,
        allowNull: false
      },
      entity_type: {
        type: Sequelize.ENUM('brand', 'category', 'product', 'blog', 'page'),
        allowNull: true
      },
      entity_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      show_image: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      icon: {
        type: Sequelize.STRING,
        allowNull: true
      },
      hide_text: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      hide_mobile_view: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      hide_desktop_view: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      icon_position: {
        type: Sequelize.ENUM('left', 'right', 'top', 'bottom'),
        allowNull: false,
        defaultValue: 'left'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('menus', ['entity_type', 'entity_id'], {
      name: 'menus_entity_type_entity_id_idx'
    });
    await queryInterface.addIndex('menus', ['menu_parent', 'order'], {
      name: 'menus_menu_parent_order_idx'
    });
    await queryInterface.addIndex('menus', ['status'], {
      name: 'menus_status_idx'
    });
    await queryInterface.addIndex('menus', ['deleted_at'], {
      name: 'menus_deleted_at_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('menus', 'menus_entity_type_entity_id_idx');
    await queryInterface.removeIndex('menus', 'menus_menu_parent_order_idx');
    await queryInterface.removeIndex('menus', 'menus_status_idx');
    await queryInterface.removeIndex('menus', 'menus_deleted_at_idx');

    // Drop the ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_menus_entity_type;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_menus_icon_position;');

    // Drop the table
    await queryInterface.dropTable('menus');
  }
}; 