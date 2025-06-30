const ReferralMethodHelper = require('../helper/referralMethod.helper');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const logger = require("../../../../library/logger");
const { ReferralMethod, sequelize } = require('../../../../models');

class ReferralMethodController {
  // Add new referral method
  async add(req, res) {
    try {
      const { referral_value_type, referral_value, status, refer_type, minimum_purchase, maximum_purchase } = req.body;

      // Check if a referral method with the same refer_type and status active already exists
      const existingReferralMethod = await ReferralMethod.findOne({
        where: {
          refer_type: refer_type
        }
      });

      if (existingReferralMethod) {
        return errorResponse(res, { 
          message: `An referral method for ${refer_type} already exists. Please update the existing one.` 
        }, `Referral method for ${refer_type} already exists`, 400);
      }

      let finalStatus = status;
      if (referral_value == 0) {
        finalStatus = 'inactive';
      }
      else if (referral_value > 0) {
        finalStatus = 'active';
      }
      const referralMethod = await ReferralMethod.create({
        referral_value_type,
        referral_value,
        status: finalStatus,
        refer_type,
        minimum_purchase,
        maximum_purchase
      });

      return successResponse(res, {
        success: true,
        message: 'Referral method created successfully',
        data: referralMethod
      }, "Referral method created successfully");
    } catch (error) {
      logger.error('Error creating referral method', { error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }

  // Edit existing referral method
  async edit(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { referral_value_type, referral_value, status, refer_type, minimum_purchase, maximum_purchase } = req.body;
      const referralMethod = await ReferralMethod.findByPk(id);
      if (!referralMethod) {
        await transaction.rollback();
        logger.warn('Referral method not found for update', { id });
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }
      let finalStatus = status;
      if (referral_value == 0) {
        finalStatus = 'inactive';
      }
      else if (referral_value > 0) {
        finalStatus = 'active';
      }
      const updatedMethod = await ReferralMethod.update({
        referral_value_type,
        referral_value,
        status: finalStatus,
        refer_type,
        minimum_purchase,
        maximum_purchase
      }, { 
        where: { id },
        transaction 
      });

      await transaction.commit();

      // Fetch the updated method to return complete data
      const updatedMethodData = await ReferralMethod.findByPk(id);

      return successResponse(res, {
        success: true,
        message: 'Referral method updated successfully',
        data: updatedMethodData
      }, "Referral method updated successfully");
    } catch (error) {
      console.log(error);
      await transaction.rollback();
      logger.error('Error updating referral method', { 
        id: req.params.id, 
        error: error.message, 
        stack: error.stack 
      });
      return errorResponse(res, error, error.message);
    }
  }

  // Delete referral method
  async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await ReferralMethod.destroy({ where: { id } });
      
      if (!result) {
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }

      return successResponse(res, {
        success: true,
        message: 'Referral method deleted successfully'
      }, "Referral method deleted successfully");
    } catch (error) {
      logger.error('Error deleting referral method', { id: req.params.id, error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }

  // Update primary status
  async updatePrimary(req, res) {
    try {
      const { id } = req.params;
      const { primary } = req.body;

      const referralMethod = await ReferralMethod.findByPk(id);
      if (!referralMethod) {
        logger.warn('Referral method not found for primary status update', { id });
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }

      const updatedMethod = await ReferralMethod.update(id, { primary }, { transaction });
      return successResponse(res, {
        success: true,
        message: 'Primary status updated successfully',
        data: updatedMethod
      }, "Primary status updated successfully");
    } catch (error) {
      logger.error('Error updating primary status', { id: req.params.id, error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }

  // Update status
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updatedMethod = await ReferralMethod.update({ status }, { where: { id } });
      if (!updatedMethod) {
        logger.warn('Referral method not found for status update', { id });
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }

      return successResponse(res, {
        success: true,
        message: 'Status updated successfully',
        data: updatedMethod
      }, "Status updated successfully");
    } catch (error) {
      logger.error('Error updating status', { id: req.params.id, error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }

  // List referral methods with filters
  async list(req, res) {
    try {
      const {
        status,
        // primary,
        search
      } = req.query;

      const where = {};
      if (status) {
        where.status = status;
      }

      // Since there are only 2 rows, fetch all without pagination
      const referralMethods = await ReferralMethod.findAll({ 
        where,
        order: [['created_at', 'DESC']]
      });

      return successResponse(res, {
        success: true,
        data: referralMethods
      }, "Referral methods retrieved successfully");
    } catch (error) {
      logger.error('Error listing referral methods', { error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }

  // Get referral method by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const referralMethod = await ReferralMethod.findByPk(id);
      
      if (!referralMethod) {
        logger.warn('Referral method not found', { id });
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }

      return successResponse(res, {
        success: true,
        data: referralMethod
      }, "Referral method retrieved successfully");
    } catch (error) {
      logger.error('Error retrieving referral method', { id: req.params.id, error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }
}

module.exports = new ReferralMethodController(); 