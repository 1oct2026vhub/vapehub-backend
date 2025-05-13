const { ReferralMethod } = require('../../../../models');
const { Op } = require('sequelize');

class ReferralMethodHelper {
  static async unsetExistingPrimary() {
    return await ReferralMethod.update(
      { primary: false },
      { where: { primary: true } }
    );
  }

  static async findById(id, options = {}) {
    return await ReferralMethod.findByPk(id, options);
  }

  static async create(data) {
    // If setting as primary, first unset any existing primary
    if (data.primary) {
      await this.unsetExistingPrimary();
    } else {
      // If not setting as primary, check if this will be the first record
      const count = await ReferralMethod.count();
      if (count === 0) {
        data.primary = true; // Force primary for first record
      }
    }
    return await ReferralMethod.create(data);
  }

  static async update(id, data) {
    const referralMethod = await this.findById(id);
    if (!referralMethod) {
      return null;
    }

    // If setting as primary, first unset any existing primary
    if (data.primary) {
      await this.unsetExistingPrimary();
    } else {
      // If unsetting primary, check if this is the only primary record
      const primaryCount = await ReferralMethod.count({ where: { primary: true } });
      if (primaryCount <= 1 && referralMethod.primary) {
        data.primary = true; // Force primary if it's the only primary record
      }
    }

    return await referralMethod.update(data);
  }

  static async delete(id) {
    const referralMethod = await this.findById(id);
    if (!referralMethod) {
      return null;
    }

    // Check if this is the only primary record
    if (referralMethod.primary) {
      const primaryCount = await ReferralMethod.count({ where: { primary: true } });
      if (primaryCount <= 1) {
        return null; // Don't allow deletion if it's the only primary record
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
          { referral_value_type: { [Op.like]: `%${search}%` } }
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

    // If setting as primary, first unset any existing primary
    if (primary) {
      await this.unsetExistingPrimary();
    } else {
      // If unsetting primary, check if this is the only primary record
      const primaryCount = await ReferralMethod.count({ where: { primary: true } });
      if (primaryCount <= 1 && referralMethod.primary) {
        return null; // Don't allow unsetting if it's the only primary record
      }
    }

    return await referralMethod.update({ primary });
  }
}

module.exports = ReferralMethodHelper; 