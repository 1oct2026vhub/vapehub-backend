const { Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { FeatureContent, User, FeatureContentIcon } = require("../../../../models");
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require("../../../../library/s3/s3Helper");

// Handle icon image upload to S3
const handleIconUpload = async (file) => {
  if (!file) return null;
  
  try {
    const uniqueFileName = generateUniqueFileName(file.originalname);
    const folderPath = 'feature-content';
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
    console.error('Error uploading icon to S3:', error);
    throw new Error('Failed to upload icon to S3');
  }
};

// Delete icon from S3
const deleteIconFromS3 = async (iconUrl) => {
  if (!iconUrl) return;
  
  try {
    const urlParts = iconUrl.split('/');
    const key = urlParts.slice(-2).join('/'); // Get folder/filename from URL
    
    await deleteFile(key);
  } catch (error) {
    console.error('Error deleting icon from S3:', error);
    // Don't throw error as this is cleanup operation
  }
};

module.exports.listAllFeatureContent = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sort = 'createdAt', order = 'DESC', deleted = false, status } = req.query;
    const offset = (page - 1) * limit;

    let whereCondition = {};
    if (search) {
      whereCondition = {
        [Op.or]: [
          { id: { [Op.like]: `%${search}%` } },
          { title: { [Op.like]: `%${search}%` } },
          { subtitle: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // Add status filter if provided
    if (status) {
      whereCondition.status = status;
    }

    // Convert deleted string to boolean
    const showDeleted = deleted === 'true' || deleted === true;

    // Include user who updated the content and icon
    const includeConditions = [
      {
        model: User,
        as: 'updater',
        attributes: ['id', 'first_name', 'last_name', 'email'],
        required: false
      },
      {
        model: FeatureContentIcon,
        as: 'icon',
        attributes: ['id', 'file_name', 'icon_url', 'createdAt'],
        required: false
      }
    ];

    // Get total count
    const totalCount = await FeatureContent.count({
      where: whereCondition,
      include: includeConditions,
      paranoid: !showDeleted,
      distinct: true
    });

    // Get paginated results
    const { rows: featureContents } = await FeatureContent.findAndCountAll({
      where: whereCondition,
      include: includeConditions,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      paranoid: !showDeleted,
      distinct: true
    });

    return successResponse(res, {
      featureContents,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    }, 'Feature content list retrieved successfully');
  } catch (error) {
    console.error('Error in listAllFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to retrieve feature content list');
  }
};

module.exports.getFeatureContentById = async (req, res) => {
  try {
    const { id } = req.params;

    const featureContent = await FeatureContent.findByPk(id, {
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        },
        {
          model: FeatureContentIcon,
          as: 'icon',
          attributes: ['id', 'file_name', 'icon_url', 'createdAt'],
          required: false
        }
      ],
      paranoid: false
    });

    if (!featureContent) {
      return errorResponse(res, { message: 'Feature content not found' }, 'Feature content not found', 404);
    }

    return successResponse(res, { featureContent }, 'Feature content retrieved successfully');
  } catch (error) {
    console.error('Error in getFeatureContentById:', error);
    return errorResponse(res, error, error.message || 'Failed to retrieve feature content');
  }
};

module.exports.createFeatureContent = async (req, res) => {
  try {
    const { title, subtitle, status = 'active' } = req.body;
    const userId = req.user.id;

    // Handle icon upload
    let iconUrl = null;
    let fileName = null;
    if (req.file) {
      iconUrl = await handleIconUpload(req.file);
      fileName = req.file.originalname;
    }

    const featureContent = await FeatureContent.create({
      title,
      subtitle,
      status,
      updated_by: userId
    });

    // Create icon record if icon was uploaded
    if (iconUrl) {
      const icon = await FeatureContentIcon.create({
        file_name: fileName,
        icon_url: iconUrl
      });
      
      // Update feature content with icon_id
      await featureContent.update({ icon_id: icon.id });
    }

    // Fetch the created content with updater info and icon
    const createdFeatureContent = await FeatureContent.findByPk(featureContent.id, {
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        },
        {
          model: FeatureContentIcon,
          as: 'icon',
          attributes: ['id', 'file_name', 'icon_url', 'createdAt'],
          required: false
        }
      ]
    });

    return successResponse(res, { featureContent: createdFeatureContent }, 'Feature content created successfully', 201);
  } catch (error) {
    console.error('Error in createFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to create feature content');
  }
};

module.exports.updateFeatureContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, status } = req.body;
    const userId = req.user.id;

    const featureContent = await FeatureContent.findByPk(id, {
      include: [
        {
          model: FeatureContentIcon,
          as: 'icon',
          required: false
        }
      ]
    });
    
    if (!featureContent) {
      return errorResponse(res, { message: 'Feature content not found' }, 'Feature content not found', 404);
    }

    // Handle icon upload if new file is provided
    if (req.file) {
      // Delete old icon from S3 if exists
      if (featureContent.icon) {
        await deleteIconFromS3(featureContent.icon.icon_url);
        // Delete old icon record
        await FeatureContentIcon.destroy({
          where: { id: featureContent.icon_id }
        });
      }
      
      // Upload new icon
      const iconUrl = await handleIconUpload(req.file);
      const fileName = req.file.originalname;
      
      // Create new icon record
      const icon = await FeatureContentIcon.create({
        file_name: fileName,
        icon_url: iconUrl
      });
      
      // Update feature content with new icon_id
      await featureContent.update({ icon_id: icon.id });
    }

    // Update the feature content
    await featureContent.update({
      title,
      subtitle,
      status,
      updated_by: userId
    });

    // Fetch the updated content with updater info and icon
    const updatedFeatureContent = await FeatureContent.findByPk(id, {
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        },
        {
          model: FeatureContentIcon,
          as: 'icon',
          attributes: ['id', 'file_name', 'icon_url', 'createdAt'],
          required: false
        }
      ]
    });

    return successResponse(res, { featureContent: updatedFeatureContent }, 'Feature content updated successfully');
  } catch (error) {
    console.error('Error in updateFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to update feature content');
  }
};

module.exports.deleteFeatureContent = async (req, res) => {
  try {
    const { id } = req.params;

    const featureContent = await FeatureContent.findByPk(id, {
      include: [
        {
          model: FeatureContentIcon,
          as: 'icon',
          required: false
        }
      ]
    });
    
    if (!featureContent) {
      return errorResponse(res, { message: 'Feature content not found' }, 'Feature content not found', 404);
    }

    // Delete icon from S3 if exists
    if (featureContent.icon) {
      await deleteIconFromS3(featureContent.icon.icon_url);
      // Delete icon record
      await FeatureContentIcon.destroy({
        where: { id: featureContent.icon_id }
      });
    }

    await featureContent.destroy();

    return successResponse(res, {}, 'Feature content deleted successfully');
  } catch (error) {
    console.error('Error in deleteFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to delete feature content');
  }
};

module.exports.restoreFeatureContent = async (req, res) => {
  try {
    const { id } = req.params;

    const featureContent = await FeatureContent.findByPk(id, { 
      paranoid: false,
      include: [
        {
          model: FeatureContentIcon,
          as: 'icon',
          attributes: ['id', 'file_name', 'icon_url', 'createdAt'],
          required: false
        }
      ]
    });
    
    if (!featureContent) {
      return errorResponse(res, { message: 'Feature content not found' }, 'Feature content not found', 404);
    }

    if (!featureContent.deletedAt) {
      return errorResponse(res, { message: 'Feature content is not deleted' }, 'Feature content is not deleted', 400);
    }

    await featureContent.restore();

    return successResponse(res, { featureContent }, 'Feature content restored successfully');
  } catch (error) {
    console.error('Error in restoreFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to restore feature content');
  }
};

module.exports.getFeatureContentIcons = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sort = 'createdAt', order = 'DESC', deleted = false } = req.query;
    const offset = (page - 1) * limit;

    let whereCondition = {};

    // Search functionality
    if (search) {
      whereCondition = {
        [Op.or]: [
          { id: { [Op.like]: `%${search}%` } },
          { file_name: { [Op.like]: `%${search}%` } },
          { icon_url: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // Convert deleted string to boolean
    const showDeleted = deleted === 'true' || deleted === true;

    // Get total count
    const totalCount = await FeatureContentIcon.count({
      where: whereCondition,
      paranoid: !showDeleted
    });

    // Get paginated results
    const { rows: icons } = await FeatureContentIcon.findAndCountAll({
      where: whereCondition,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      paranoid: !showDeleted
    });

    return successResponse(res, {
      icons,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    }, 'Feature content icons retrieved successfully');
  } catch (error) {
    console.error('Error in getFeatureContentIcons:', error);
    return errorResponse(res, error, error.message || 'Failed to retrieve feature content icons');
  }
};

module.exports.getFeatureContentIconById = async (req, res) => {
  try {
    const { id } = req.params;

    const icon = await FeatureContentIcon.findByPk(id, {
      paranoid: false
    });

    if (!icon) {
      return errorResponse(res, { message: 'Icon not found' }, 'Icon not found', 404);
    }

    return successResponse(res, { icon }, 'Icon retrieved successfully');
  } catch (error) {
    console.error('Error in getFeatureContentIconById:', error);
    return errorResponse(res, error, error.message || 'Failed to retrieve icon');
  }
};

// Add new icon independently (for Add Icon Button)
module.exports.addIcon = async (req, res) => {
  try {
    // Check if file is uploaded
    if (!req.file) {
      return errorResponse(res, { message: 'Icon file is required' }, 'Icon file is required', 400);
    }

    // Upload icon to S3
    const iconUrl = await handleIconUpload(req.file);
    const fileName = req.file.originalname;

    // Create icon record
    const icon = await FeatureContentIcon.create({
      file_name: fileName,
      icon_url: iconUrl
    });

    return successResponse(res, { icon }, 'Icon added successfully', 201);
  } catch (error) {
    console.error('Error in addIcon:', error);
    return errorResponse(res, error, error.message || 'Failed to add icon');
  }
};
