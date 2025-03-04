'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const attributes = [
      {
        "id": 12,
        "name": "flavour",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_flavour",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 15,
        "name": "nicotine-strength",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_nicotine-strength",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 17,
        "name": "bottle-size",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_bottle-size",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 18,
        "name": "e-liquid-amount",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_e-liquid-amount",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 19,
        "name": "battery",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_battery",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 20,
        "name": "number-of-puffs",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_number-of-puffs",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 21,
        "name": "coil-resistance",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_coil-resistance",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 22,
        "name": "product-colour",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_product-colour",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 23,
        "name": "vaping-style",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_vaping-style",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 24,
        "name": "type-of-vape-kit",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_type-of-vape-kit",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 25,
        "name": "tank-size",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_tank-size",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 26,
        "name": "vg-pg",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_vg-pg",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 29,
        "name": "pod-size",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_pod-size",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      },
      {
        "id": 31,
        "name": "strength",
        "type": "select",
        "sort_order": "name",
        "slug": "pa_strength",
        "created_at": now,
        "updated_at": now,
        "updated_by": null
      }
    ];

    // Delete existing records and insert new ones
    await queryInterface.bulkDelete('attributes', null, {});
    await queryInterface.bulkInsert('attributes', attributes, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('attributes', null, {});
  }
};