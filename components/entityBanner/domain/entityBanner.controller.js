'use strict';
const { EntityBanner } = require('../../../models');
const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Op } = require('sequelize');
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require('../../../library/s3/s3Helper');

/**
 * Handle image upload to S3
 * @param {Object} file - Multer file object
 * @returns {Promise<string>} - S3 URL of uploaded image
 */
const handleImageUpload = async (file) => {
    if (!file) return null;
    
    try {
        const { getUniqueFileNameWithPrefix } = require("../../../library/s3/s3Helper");
        const uniqueFileName = await getUniqueFileNameWithPrefix(file.originalname, 'entity-banners');
        const key = `entity-banners/${uniqueFileName}`;
        
        const uploadParams = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        };
        
        const result = await uploadFiletToS3(uploadParams);
        return result.Location;
        
    } catch (error) {
        console.error('Error uploading image to S3:', error);
        throw new Error('Failed to upload image to S3');
    }
};

/**
 * Delete image from S3
 * @param {string} imageUrl - S3 URL of the image
 */
const deleteImageFromS3 = async (imageUrl) => {
    if (!imageUrl) return;

    try {
        // Extract key from S3 URL
        const urlParts = imageUrl.split('/');
        const keyIndex = urlParts.indexOf('entity-banners');
        if (keyIndex !== -1) {
            const key = urlParts.slice(keyIndex).join('/');
            await deleteFile(key);
        }
    } catch (error) {
        console.error('Error deleting image from S3:', error);
        // Don't throw error as this is not critical
    }
};

/**
 * Enforce maximum 3 banners per brand/category/deal.
 * For:
 *  - type='brand'    → scoped by brand_id
 *  - type='category' → scoped by category_id
 *  - type='deal'     → scoped by deals_id
 * If excludeId is provided, it will be ignored from the count (useful for updates).
 */
const assertMaxPerEntity = async ({ type, brand_id, category_id, deals_id }, excludeId = null) => {
    const where = { type };

    if (type === 'brand') {
        if (!brand_id) {
            const error = new Error('brand_id is required when type is "brand"');
            error.statusCode = 400;
            throw error;
        }
        where.brand_id = brand_id;
    } else if (type === 'category') {
        if (!category_id) {
            const error = new Error('category_id is required when type is "category"');
            error.statusCode = 400;
            throw error;
        }
        where.category_id = category_id;
    } else if (type === 'deal') {
        if (!deals_id) {
            const error = new Error('deals_id is required when type is "deal"');
            error.statusCode = 400;
            throw error;
        }
        where.deals_id = deals_id;
    }

    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }

    const currentCount = await EntityBanner.count({ where });
    if (currentCount >= 3) {
        const error = new Error('Maximum 3 banners allowed for this entity');
        error.statusCode = 422;
        throw error;
    }
};

/**
 * Enforce unique order per entity (brand/category/deal).
 * For:
 *  - type='brand'    → scoped by brand_id
 *  - type='category' → scoped by category_id
 *  - type='deal'     → scoped by deals_id
 * If excludeId is provided, it will be ignored from the check (useful for updates).
 */
const assertUniqueOrder = async ({ type, brand_id, category_id, deals_id, order }, excludeId = null) => {
    const where = { type, order };

    if (type === 'brand') {
        if (!brand_id) {
            const error = new Error('brand_id is required when type is "brand"');
            error.statusCode = 400;
            throw error;
        }
        where.brand_id = brand_id;
    } else if (type === 'category') {
        if (!category_id) {
            const error = new Error('category_id is required when type is "category"');
            error.statusCode = 400;
            throw error;
        }
        where.category_id = category_id;
    } else if (type === 'deal') {
        if (!deals_id) {
            const error = new Error('deals_id is required when type is "deal"');
            error.statusCode = 400;
            throw error;
        }
        where.deals_id = deals_id;
    }

    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }

    const existingBanner = await EntityBanner.findOne({ where });
    if (existingBanner) {
        const error = new Error('An entity banner with this order already exists for this entity');
        error.statusCode = 422;
        throw error;
    }
};

module.exports.listEntityBanners = async (req, res) => {
    try {
        const { page = 1, limit = 10, type, brand_id, category_id, deals_id } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
        const offset = (pageNum - 1) * limitNum;

        const where = {};
        if (type) where.type = type;
        if (brand_id) where.brand_id = brand_id;
        if (category_id) where.category_id = category_id;
        if (deals_id) where.deals_id = deals_id;

        const { rows, count } = await EntityBanner.findAndCountAll({
            where,
            order: [['order', 'ASC'], ['createdAt', 'DESC']],
            limit: limitNum,
            offset
        });

        return successResponse(res, {
            entityBanners: rows,
            pagination: {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum) || 1
            }
        }, 'Entity banners retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getEntityBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const entityBanner = await EntityBanner.findByPk(id);
        if (!entityBanner) {
            return errorResponse(res, { statusCode: 404 }, 'Entity banner not found');
        }
        return successResponse(res, entityBanner, 'Entity banner retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createEntityBanner = async (req, res) => {
    try {
        const { type, brand_id, category_id, deals_id, image, alt, url, order = 0 } = req.body;

        // Enforce per-entity limit (3 banners per brand/category/deal)
        await assertMaxPerEntity({ type, brand_id, category_id, deals_id });

        // Enforce unique order per entity
        await assertUniqueOrder({ type, brand_id, category_id, deals_id, order });

        // Handle image: if file is uploaded, use it; otherwise use URL from body
        let imageUrl = image;
        if (req.file) {
            imageUrl = await handleImageUpload(req.file);
        } else if (!image) {
            return errorResponse(res, { statusCode: 400 }, 'Image is required (either as file upload or URL)');
        }

        const updated_by = req.user?.id ?? null;
        const entityBanner = await EntityBanner.create({
            type,
            brand_id,
            category_id,
            deals_id,
            image: imageUrl,
            alt,
            url,
            order,
            ...(updated_by != null && { updated_by })
        });

        return successResponse(res, entityBanner, 'Entity banner created successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateEntityBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, brand_id, category_id, deals_id, image, alt, url, order } = req.body;

        const entityBanner = await EntityBanner.findByPk(id);
        if (!entityBanner) {
            return errorResponse(res, { statusCode: 404 }, 'Entity banner not found');
        }

        const newType = type ?? entityBanner.type;
        const newBrandId = brand_id ?? entityBanner.brand_id;
        const newCategoryId = category_id ?? entityBanner.category_id;
        const newDealsId = deals_id ?? entityBanner.deals_id;
        const newOrder = order !== undefined ? order : entityBanner.order;

        // Enforce per-entity limit (3 banners per brand/category/deal)
        await assertMaxPerEntity(
            {
                type: newType,
                brand_id: newBrandId,
                category_id: newCategoryId,
                deals_id: newDealsId
            },
            entityBanner.id
        );

        // Enforce unique order per entity (only check if order is being changed)
        if (order !== undefined && order !== entityBanner.order) {
            await assertUniqueOrder(
                {
                    type: newType,
                    brand_id: newBrandId,
                    category_id: newCategoryId,
                    deals_id: newDealsId,
                    order: newOrder
                },
                entityBanner.id
            );
        }

        // Handle image update: if new file is uploaded, upload it and delete old one
        let imageUrl = image ?? entityBanner.image;
        if (req.file) {
            // Delete old image if it exists and is from S3
            if (entityBanner.image) {
                await deleteImageFromS3(entityBanner.image);
            }
            imageUrl = await handleImageUpload(req.file);
        }

        const updatePayload = {
            type: newType,
            brand_id: newBrandId,
            category_id: newCategoryId,
            deals_id: newDealsId,
            image: imageUrl,
            alt: alt ?? entityBanner.alt,
            url: url ?? entityBanner.url,
            order: newOrder
        };
        const updated_by = req.user?.id ?? null;
        if (updated_by != null) updatePayload.updated_by = updated_by;
        await entityBanner.update(updatePayload);

        return successResponse(res, entityBanner, 'Entity banner updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteEntityBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const entityBanner = await EntityBanner.findByPk(id);
        if (!entityBanner) {
            return errorResponse(res, { statusCode: 404 }, 'Entity banner not found');
        }
        
        // Delete image from S3 if it exists
        if (entityBanner.image) {
            await deleteImageFromS3(entityBanner.image);
        }
        
        await entityBanner.destroy();
        return successResponse(res, {}, 'Entity banner deleted successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};
