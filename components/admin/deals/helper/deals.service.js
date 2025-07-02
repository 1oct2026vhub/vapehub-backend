'use strict';
const dealsService = require('../domain/deals.controller');
const { DEAL_TYPES } = require('../../../../config/constants');

class DealsController {
    async createDeal(req, res) {
        try {
            const dealData = req.body;
            const productIds = dealData.productIds;
            delete dealData.productIds;

            // Validate deal data based on type
            dealsService.validateDealData(dealData);

            const deal = await dealsService.createDeal(dealData, productIds);
            res.status(201).json({
                success: true,
                data: deal
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async updateDeal(req, res) {
        try {
            const { id } = req.params;
            const dealData = req.body;
            const productIds = dealData.productIds;
            delete dealData.productIds;

            // Validate deal data based on type
            dealsService.validateDealData(dealData);

            const deal = await dealsService.updateDeal(id, dealData, productIds);
            res.json({
                success: true,
                data: deal
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async getDeal(req, res) {
        try {
            const { id } = req.params;
            const deal = await dealsService.getDealById(id);
            
            if (!deal) {
                return res.status(404).json({
                    success: false,
                    message: 'Deal not found'
                });
            }

            res.json({
                success: true,
                data: deal
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async listDeals(req, res) {
        try {
            const filters = {
                status: req.query.status !== undefined ? req.query.status === 'true' : undefined,
                type: req.query.type,
                validNow: req.query.validNow === 'true'
            };

            const deals = await dealsService.listDeals(filters);
            res.json({
                success: true,
                data: deals
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async getDealsByProduct(req, res) {
        try {
            const { productId } = req.params;
            const deals = await dealsService.getDealsByProduct(productId);
            res.json({
                success: true,
                data: deals
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async deleteDeal(req, res) {
        try {
            const { id } = req.params;
            await dealsService.deleteDeal(id);
            res.json({
                success: true,
                message: 'Deal deleted successfully'
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    async restoreDeal(req, res) {
        try {
            const { id } = req.params;
            const deal = await dealsService.restoreDeal(id);
            res.json({
                success: true,
                data: deal
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    // Helper method to get deal types for documentation
    getDealTypes(req, res) {
        res.json({
            success: true,
            data: DEAL_TYPES
        });
    }
}

module.exports = new DealsController(); 