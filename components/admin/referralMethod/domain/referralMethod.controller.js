const ReferralMethodHelper = require('../helper/referralMethod.helper');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const logger = require("../../../../library/logger");


class ReferralMethodController {
  // Add new referral method
  async add(req, res) {
    try {
      const { referral_value_type, referral_value, status, primary, refer_type, minimum_purchase, maximum_purchase } = req.body;

      const referralMethod = await ReferralMethodHelper.create({
        referral_value_type,
        referral_value,
        status,
        primary,
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
    try {
      const { id } = req.params;
      const { referral_value_type, referral_value, status, primary, refer_type, minimum_purchase, maximum_purchase } = req.body;

      const referralMethod = await ReferralMethodHelper.findById(id);
      if (!referralMethod) {
        logger.warn('Referral method not found for update', { id });
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }

      const updatedMethod = await ReferralMethodHelper.update(id, {
        referral_value_type,
        referral_value,
        status,
        primary,
        refer_type,
        minimum_purchase,
        maximum_purchase
      });

      return successResponse(res, {
        success: true,
        message: 'Referral method updated successfully',
        data: updatedMethod
      }, "Referral method updated successfully");
    } catch (error) {
      logger.error('Error updating referral method', { id: req.params.id, error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }

  // Delete referral method
  async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await ReferralMethodHelper.delete(id);
      
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

      const referralMethod = await ReferralMethodHelper.findById(id);
      if (!referralMethod) {
        logger.warn('Referral method not found for primary status update', { id });
        return errorResponse(res, { message: "Referral method not found" }, "Not Found", 404);
      }

      const updatedMethod = await ReferralMethodHelper.updatePrimary(id, primary);
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

      const updatedMethod = await ReferralMethodHelper.updateStatus(id, status);
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
        page = 1,
        limit = 10,
        sort_by = 'created_at',
        order = 'DESC',
        status,
        primary,
        search
      } = req.query;

      const where = {};
      if (status) {
        where.status = status;
      }
      if (primary !== undefined) {
        where.primary = primary === 'true';
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort_by,
        order,
        search
      };

      const result = await ReferralMethodHelper.search(where, options);
      return successResponse(res, {
        success: true,
        data: result.data,
        pagination: result.pagination
      }, "Referral methods retrieved successfully");
    } catch (error) {
      logger.error('Error listing referral methods', { error: error.message, stack: error.stack });
      return errorResponse(res, error, error.message);
    }
  }
}

module.exports = new ReferralMethodController(); 