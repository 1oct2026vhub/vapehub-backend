const { ReferralMethod } = require('../../../../models');
const { Op } = require('sequelize');
const { sequelize } = require('../../../../models');

class ReferralMethodHelper {
  static async unsetExistingPrimaryByReferType(referType, transaction = null) {
    const options = {
      where: { primary: true, refer_type: referType }
    };
    if (transaction) {
      options.transaction = transaction;
    }
    return await ReferralMethod.update({ primary: false }, options);
  }

  static async findById(id, options = {}) {
    return await ReferralMethod.findByPk(id, options);
  }

  static async create(data) {
    // If setting as primary, first unset any existing primary for the same refer_type
    if (data.primary) {
      await this.unsetExistingPrimaryByReferType(data.refer_type);
    } else {
      // If not setting as primary, check if this will be the first record for this refer_type
      const count = await ReferralMethod.count({ where: { refer_type: data.refer_type } });
      if (count === 0) {
        data.primary = true; // Force primary for first record of this refer_type
      }
    }
    return await ReferralMethod.create(data);
  }

  static async update(id, data) {
    const transaction = await sequelize.transaction();
    try {
      const referralMethod = await ReferralMethod.findByPk(id, { transaction });
      if (!referralMethod) {
        await transaction.rollback();
        return null;
      }

      // If setting as primary, first unset any existing primary for the same refer_type
      if (data.primary) {
        await this.unsetExistingPrimaryByReferType(referralMethod.refer_type, transaction);
      } else {
        // If unsetting primary, check if this is the only primary record for this refer_type
        const primaryCount = await ReferralMethod.count({ 
          where: { 
            primary: true,
            refer_type: referralMethod.refer_type 
          },
          transaction 
        });
        if (primaryCount <= 1 && referralMethod.primary) {
          data.primary = true; // Force primary if it's the only primary record for this refer_type
        }
      }

      const updatedMethod = await ReferralMethod.update(data, { where: { id: id }, transaction });
      await transaction.commit();
      return updatedMethod;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async delete(id) {
    const referralMethod = await this.findById(id);
    if (!referralMethod) {
      return null;
    }

    // Check if this is the only primary record for this refer_type
    if (referralMethod.primary) {
      const primaryCount = await ReferralMethod.count({ 
        where: { 
          primary: true,
          refer_type: referralMethod.refer_type 
        } 
      });
      if (primaryCount <= 1) {
        return null; // Don't allow deletion if it's the only primary record for this refer_type
      }
    }

    return await referralMethod.destroy({ force: true });
  }

  static async findAll(where = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort_by = 'created_at',
      order = 'DESC'
    } = options;

    const offset = (page - 1) * limit;

    const { count, rows } = await ReferralMethod.findAndCountAll({
      where,
      order: [[sort_by, order]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return {
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    };
  }

  static async search(where = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort_by = 'created_at',
      order = 'DESC',
      search
    } = options;

    let searchWhere = { ...where };

    if (search) {
      searchWhere = {
        ...searchWhere,
        [Op.or]: [
          { referral_value: { [Op.like]: `%${search}%` } },
          { referral_value_type: { [Op.like]: `%${search}%` } },
          { refer_type: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    return await this.findAll(searchWhere, { page, limit, sort_by, order });
  }

  static async updateStatus(id, status) {
    const referralMethod = await this.findById(id);
    if (!referralMethod) {
      return null;
    }
    return await referralMethod.update({ status });
  }

  static async updatePrimary(id, primary) {
    const referralMethod = await this.findById(id);
    if (!referralMethod) {
      return null;
    }

    // If setting as primary, first unset any existing primary for the same refer_type
    if (primary) {
      await this.unsetExistingPrimaryByReferType(referralMethod.refer_type);
    } else {
      // If unsetting primary, check if this is the only primary record for this refer_type
      const primaryCount = await ReferralMethod.count({ 
        where: { 
          primary: true,
          refer_type: referralMethod.refer_type 
        } 
      });
      if (primaryCount <= 1 && referralMethod.primary) {
        return null; // Don't allow unsetting if it's the only primary record for this refer_type
      }
    }

    return await referralMethod.update({ primary });
  }
}

module.exports = ReferralMethodHelper; 