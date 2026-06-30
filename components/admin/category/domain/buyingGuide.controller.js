const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Category, CategoryBuyingGuide, sequelize } = require('../../../../models');
const { uploadFiletToS3, deleteFile } = require('../../../../library/s3/s3Helper');
const { invalidateCachePattern } = require('../../../../library/cache');
const { extractS3KeyFromUrl } = require('../helper/buyingGuidePayload.helper');
const {
    findBuyingGuideByCategoryId,
    replaceBuyingGuideChildren,
    buildParentAttributes
} = require('../helper/buyingGuideRelations.helper');
const { formatAdminBuyingGuide } = require('../../../category/helper/buyingGuide.serializer');

const uploadBannerImage = async (file) => {
    const { originalname, mimetype, buffer } = file;
    const { getUniqueFileNameWithPrefix } = require('../../../../library/s3/s3Helper');
    const fileName = await getUniqueFileNameWithPrefix(originalname, 'category-buying-guide');
    const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `category/buying-guide/${fileName}`,
        Body: buffer,
        ContentType: mimetype
    };
    const uploadedImage = await uploadFiletToS3(params);
    if (!uploadedImage?.Location) {
        throw new Error('File upload failed');
    }
    return uploadedImage.Location;
};

const removeBannerImage = async (bannerUrl) => {
    const imageKey = extractS3KeyFromUrl(bannerUrl);
    if (imageKey) {
        await deleteFile(imageKey).catch(() => {});
    }
};

const resolveBannerImage = async ({ payload, existingGuide, bannerFile }) => {
    if (bannerFile) {
        if (existingGuide?.banner_image) {
            await removeBannerImage(existingGuide.banner_image);
        }
        return uploadBannerImage(bannerFile);
    }

    if (payload.banner_image === null) {
        if (existingGuide?.banner_image) {
            await removeBannerImage(existingGuide.banner_image);
        }
        return null;
    }

    if (payload.banner_image !== undefined) {
        return payload.banner_image;
    }

    return undefined;
};

module.exports.getBuyingGuide = async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id, 10);
        const category = await Category.findByPk(categoryId, { paranoid: true });

        if (!category) {
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        const buyingGuide = await findBuyingGuideByCategoryId(categoryId);
        if (!buyingGuide) {
            return errorResponse(res, { message: 'Buying guide not found' }, 'Buying guide not found', 404);
        }

        return successResponse(
            res,
            { buyingGuide: formatAdminBuyingGuide(buyingGuide) },
            'Buying guide fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch buying guide');
    }
};

module.exports.saveBuyingGuide = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const categoryId = parseInt(req.params.id, 10);
        const payload = req.buyingGuidePayload;
        const category = await Category.findByPk(categoryId, { paranoid: true, transaction });

        if (!category) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        let existingGuide = await CategoryBuyingGuide.findOne({
            where: { category_id: categoryId },
            transaction
        });
        const isCreate = !existingGuide;

        const banner_image = await resolveBannerImage({
            payload,
            existingGuide,
            bannerFile: req.file
        });

        const parentAttributes = buildParentAttributes(payload, existingGuide);
        if (banner_image !== undefined) {
            parentAttributes.banner_image = banner_image;
        }

        if (isCreate) {
            existingGuide = await CategoryBuyingGuide.create({
                category_id: categoryId,
                ...parentAttributes
            }, { transaction });
        } else {
            await existingGuide.update(parentAttributes, { transaction });
        }

        await replaceBuyingGuideChildren(existingGuide.id, payload, transaction);

        const savedGuide = await findBuyingGuideByCategoryId(categoryId, transaction);
        await transaction.commit();

        invalidateCachePattern('category:*').catch(() => {});
        invalidateCachePattern('buying-guide:*').catch(() => {});

        return successResponse(
            res,
            { buyingGuide: formatAdminBuyingGuide(savedGuide) },
            'Buying guide saved successfully',
            isCreate ? 201 : 200
        );
    } catch (error) {
        await transaction.rollback();
        const clientErrors = [
            'Invalid related category ID',
            'File upload failed',
            'Duplicate related category IDs are not allowed',
            'Category cannot relate to itself',
            'Maximum 3 related categories allowed'
        ];
        const statusCode = clientErrors.includes(error.message) ? 400 : 500;
        return errorResponse(res, error, error.message || 'Failed to save buying guide', statusCode);
    }
};
