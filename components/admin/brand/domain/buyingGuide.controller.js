const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Brand, BrandBuyingGuide, sequelize } = require('../../../../models');
const { uploadFiletToS3, deleteFile } = require('../../../../library/s3/s3Helper');
const { invalidateCachePattern } = require('../../../../library/cache');
const { extractS3KeyFromUrl } = require('../../category/helper/buyingGuidePayload.helper');
const {
    findBuyingGuideByBrandId,
    replaceBuyingGuideChildren,
    buildParentAttributes
} = require('../helper/buyingGuideRelations.helper');
const { formatAdminBuyingGuide } = require('../../../category/helper/buyingGuide.serializer');

const uploadBannerImage = async (file) => {
    const { originalname, mimetype, buffer } = file;
    const { getUniqueFileNameWithPrefix } = require('../../../../library/s3/s3Helper');
    const fileName = await getUniqueFileNameWithPrefix(originalname, 'brand-buying-guide');
    const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `brand/buying-guide/${fileName}`,
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
        const brandId = parseInt(req.params.id, 10);
        const brand = await Brand.findByPk(brandId, { paranoid: true });

        if (!brand) {
            return errorResponse(res, { message: 'Brand not found' }, 'Brand not found', 404);
        }

        const buyingGuide = await findBuyingGuideByBrandId(brandId);
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
        const brandId = parseInt(req.params.id, 10);
        const payload = req.buyingGuidePayload;
        const brand = await Brand.findByPk(brandId, { paranoid: true, transaction });

        if (!brand) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Brand not found' }, 'Brand not found', 404);
        }

        let existingGuide = await BrandBuyingGuide.findOne({
            where: { brand_id: brandId },
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
            existingGuide = await BrandBuyingGuide.create({
                brand_id: brandId,
                ...parentAttributes
            }, { transaction });
        } else {
            await existingGuide.update(parentAttributes, { transaction });
        }

        await replaceBuyingGuideChildren(existingGuide.id, payload, transaction);

        const savedGuide = await findBuyingGuideByBrandId(brandId, transaction);
        await transaction.commit();

        invalidateCachePattern('brand:*').catch(() => {});
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
            'Invalid related blog ID',
            'File upload failed',
            'Duplicate related blog IDs are not allowed',
            'Maximum 3 related blogs allowed'
        ];
        const statusCode = clientErrors.includes(error.message) ? 400 : 500;
        return errorResponse(res, error, error.message || 'Failed to save buying guide', statusCode);
    }
};
