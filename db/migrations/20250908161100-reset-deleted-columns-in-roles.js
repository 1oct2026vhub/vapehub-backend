'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Resetting deleted & deletedAt columns in roles table...');

    const table = await queryInterface.describeTable('roles');

    // 1. Drop deleted if exists
    if (table.deleted) {
      try {
        await queryInterface.removeColumn('roles', 'deleted');
        console.log('Removed old deleted column');
      } catch (err) {
        console.error('Error removing deleted column:', err.message);
      }
    }

    // 2. Drop deletedAt if exists
    if (table.deletedAt) {
      try {
        await queryInterface.removeColumn('roles', 'deletedAt');
        console.log('Removed old deletedAt column');
      } catch (err) {
        console.error('Error removing deletedAt column:', err.message);
      }
    }

    // 3. Add new deleted
    try {
      await queryInterface.addColumn('roles', 'deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log('Added new deleted column');
    } catch (err) {
      console.error('Error adding deleted column:', err.message);
    }

    // 4. Add new deletedAt
    try {
      await queryInterface.addColumn('roles', 'deletedAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
      console.log('Added new deletedAt column');
    } catch (err) {
      console.error('Error adding deletedAt column:', err.message);
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('Reverting roles table deleted & deletedAt reset...');

    const table = await queryInterface.describeTable('roles');

    // Drop both new columns
    if (table.deleted) {
      try {
        await queryInterface.removeColumn('roles', 'deleted');
        console.log('Removed deleted column');
      } catch (err) {
        console.error('Error removing deleted column:', err.message);
      }
    }

    if (table.deletedAt) {
      try {
        await queryInterface.removeColumn('roles', 'deletedAt');
        console.log('Removed deletedAt column');
      } catch (err) {
        console.error('Error removing deletedAt column:', err.message);
      }
    }

    // Optionally add back only one (your old schema)
    try {
      await queryInterface.addColumn('roles', 'deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log('Restored old deleted column');
    } catch (err) {
      console.error('Error restoring deleted column:', err.message);
    }
  },
};
