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
        const uniqueFileName = generateUniqueFileName(file.originalname);
        const folderPath = 'entity-banners';
        const key = `${folderPath}/${uniqueFileName}`;
        
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
 * Enforce maximum 3 banners per type.
 * If excludeId is provided, it will be ignored from the count (useful for updates).
 */
const assertMaxPerType = async (type, excludeId = null) => {
    const where = { type };
    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }
    const currentCount = await EntityBanner.count({ where });
    if (currentCount >= 3) {
        const error = new Error(`Maximum 3 banners allowed for type "${type}"`);
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

        await assertMaxPerType(type);

        // Handle image: if file is uploaded, use it; otherwise use URL from body
        let imageUrl = image;
        if (req.file) {
            imageUrl = await handleImageUpload(req.file);
        } else if (!image) {
            return errorResponse(res, { statusCode: 400 }, 'Image is required (either as file upload or URL)');
        }

        const entityBanner = await EntityBanner.create({
            type,
            brand_id,
            category_id,
            deals_id,
            image: imageUrl,
            alt,
            url,
            order
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
        await assertMaxPerType(newType, entityBanner.id);

        // Handle image update: if new file is uploaded, upload it and delete old one
        let imageUrl = image ?? entityBanner.image;
        if (req.file) {
            // Delete old image if it exists and is from S3
            if (entityBanner.image) {
                await deleteImageFromS3(entityBanner.image);
            }
            imageUrl = await handleImageUpload(req.file);
        }

        await entityBanner.update({
            type: newType,
            brand_id: brand_id ?? entityBanner.brand_id,
            category_id: category_id ?? entityBanner.category_id,
            deals_id: deals_id ?? entityBanner.deals_id,
            image: imageUrl,
            alt: alt ?? entityBanner.alt,
            url: url ?? entityBanner.url,
            order: order ?? entityBanner.order
        });

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
