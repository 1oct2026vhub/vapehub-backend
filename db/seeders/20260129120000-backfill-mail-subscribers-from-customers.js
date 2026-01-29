'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Starting seeder: backfill mail subscribers from customers...');

      const tableDescription = await queryInterface.describeTable('mail_subscription');
      const createdAtCol = tableDescription.createdAt ? 'createdAt' : 'created_at';
      const updatedAtCol = tableDescription.updatedAt ? 'updatedAt' : 'updated_at';
      const deletedAtCol = tableDescription.deletedAt ? 'deletedAt' : 'deleted_at';

      // Customers: non-temporary users with permission 'user' (exclude admin roles)
      const users = await queryInterface.sequelize.query(
        `SELECT u.id, u.email
         FROM users u
         LEFT JOIN roles r ON u.roleId = r.id
         WHERE u.is_temporary = 0
           AND (u.roleId IS NULL OR r.permission = 'user')
           AND u.deleted_at IS NULL`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );

      console.log(`📊 Found ${users.length} customer(s) to set as mail subscribers`);

      if (users.length === 0) {
        console.log('✅ No customers to backfill. Seeder completed.');
        await transaction.commit();
        return;
      }

      const dialect = queryInterface.sequelize.getDialect();
      const wrap = (name) => (dialect === 'mysql' ? '`' + name + '`' : '"' + name + '"');

      let created = 0;
      let updated = 0;

      for (const u of users) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT id FROM mail_subscription WHERE email = :email LIMIT 1`,
          { replacements: { email: u.email }, transaction }
        );

        if (existing && existing.length > 0) {
          await queryInterface.sequelize.query(
            `UPDATE mail_subscription
             SET user_id = :userId, subscribed = 1, ${wrap(deletedAtCol)} = NULL, ${wrap(updatedAtCol)} = CURRENT_TIMESTAMP
             WHERE email = :email`,
            { replacements: { userId: u.id, email: u.email }, transaction }
          );
          updated++;
        } else {
          await queryInterface.sequelize.query(
            `INSERT INTO mail_subscription (user_id, email, subscribed, isDiscountUsed, ${wrap(createdAtCol)}, ${wrap(updatedAtCol)})
             VALUES (:userId, :email, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            { replacements: { userId: u.id, email: u.email }, transaction }
          );
          created++;
        }
      }

      await transaction.commit();

      console.log('\n📊 SEEDER SUMMARY:');
      console.log(`   • Subscriptions created: ${created}`);
      console.log(`   • Subscriptions updated: ${updated}`);
      console.log(`   • Total customers processed: ${users.length}`);
      console.log('\n✅ Mail subscribers backfill seeder completed successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Seeder Error:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⏭️  No automatic rollback - manual intervention required if you need to unsubscribe backfilled users.');
  }
};
