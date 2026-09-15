'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('footer_badges', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      icon_url: {
        type: Sequelize.TEXT('long'),
        allowNull: false
      },
      heading: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      subtitle: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      deleted_at: {
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('footer_badges', ['order']);
    await queryInterface.addIndex('footer_badges', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('footer_badges');
  }
};
