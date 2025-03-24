'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create footer sections
    await queryInterface.bulkInsert('footer_sections', [
      {
        title: 'Help',
        order: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: 'Quick Links',
        order: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: 'Shop',
        order: 3,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        title: 'About Us',
        order: 4,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Get the inserted sections
    const sections = await queryInterface.sequelize.query(
      `SELECT id, title FROM footer_sections ORDER BY \`order\` ASC;`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Create footer links
    const links = [
      // Help section links
      {
        section_id: sections[0].id,
        label: 'Contact Us',
        url: '/contact',
        order: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[0].id,
        label: 'FAQ',
        url: '/faq',
        order: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[0].id,
        label: 'Shipping Information',
        url: '/shipping',
        order: 3,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Quick Links section links
      {
        section_id: sections[1].id,
        label: 'My Account',
        url: '/account',
        order: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[1].id,
        label: 'Order History',
        url: '/orders',
        order: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[1].id,
        label: 'Wishlist',
        url: '/wishlist',
        order: 3,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // Shop section links
      {
        section_id: sections[2].id,
        label: 'New Arrivals',
        url: '/new-arrivals',
        order: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[2].id,
        label: 'Best Sellers',
        url: '/best-sellers',
        order: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[2].id,
        label: 'Special Offers',
        url: '/special-offers',
        order: 3,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // About Us section links
      {
        section_id: sections[3].id,
        label: 'Our Story',
        url: '/about',
        order: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[3].id,
        label: 'Privacy Policy',
        url: '/privacy-policy',
        order: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        section_id: sections[3].id,
        label: 'Terms & Conditions',
        url: '/terms',
        order: 3,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('footer_links', links);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('footer_links', null, {});
    await queryInterface.bulkDelete('footer_sections', null, {});
  }
}; 