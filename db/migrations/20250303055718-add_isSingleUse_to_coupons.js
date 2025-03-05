module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable("coupons");

    // Check if the column already exists
    if (!tableDescription.is_single_use) {
      await queryInterface.addColumn("coupons", "is_single_use", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable("coupons");

    // Check if the column exists before trying to remove it
    if (tableDescription.is_single_use) {
      await queryInterface.removeColumn("coupons", "is_single_use");
    }
  },
};
