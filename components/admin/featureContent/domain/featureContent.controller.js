const { Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { FeatureContent, User, FeatureContentIcon } = require("../../../../models");
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require("../../../../library/s3/s3Helper");

// Handle icon image upload to S3
const handleIconUpload = async (file) => {
  if (!file) return null;
  
  try {
    const { getUniqueFileNameWithPrefix } = require("../../../../library/s3/s3Helper");
    const uniqueFileName = await getUniqueFileNameWithPrefix(file.originalname, 'feature-content');
    const key = `feature-content/${uniqueFileName}`;
    
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
    const { page = 1, limit = 10, search, sort = 'createdAt', order = 'DESC', deleted, status } = req.query;
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

    // Convert deleted string to boolean - properly handle undefined, 'true', 'false', '0', '1', true, false
    const showDeleted = deleted === 'true' || deleted === '1' || deleted === true;
    
    // Add deleted filter to whereCondition
    if (deleted !== undefined) {
      if (showDeleted) {
        // Show only deleted records
        whereCondition.deletedAt = { [Op.ne]: null };
      } else {
        // Show only non-deleted records
        whereCondition.deletedAt = null;
      }
    }
    
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
      paranoid: false, // Always include deleted records when filtering
      distinct: true
    });

    // Get paginated results
    const { rows: featureContents } = await FeatureContent.findAndCountAll({
      where: whereCondition,
      include: includeConditions,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      paranoid: false, // Always include deleted records when filtering
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
    const { title, subtitle, status = 'active', icon_id, link } = req.body;
    const userId = req.user.id;

    // Validate icon_id if provided
    if (icon_id) {
      const iconExists = await FeatureContentIcon.findByPk(icon_id);
      if (!iconExists) {
        return errorResponse(res, { message: 'Icon not found' }, 'Icon not found', 404);
      }
    }

    const featureContent = await FeatureContent.create({
      title,
      subtitle,
      status,
      icon_id,
      link,
      updated_by: userId
    });

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
    const { title, subtitle, status, icon_id, link } = req.body;
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

    // Validate icon_id if provided
    if (icon_id) {
      const iconExists = await FeatureContentIcon.findByPk(icon_id);
      if (!iconExists) {
        return errorResponse(res, { message: 'Icon not found' }, 'Icon not found', 404);
      }
    }

    // Update the feature content
    await featureContent.update({
      title,
      subtitle,
      status,
      icon_id,
      link,
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

/**
 * Bulk soft-delete feature content by IDs
 */
module.exports.bulkDeleteFeatureContent = async (req, res) => {
  try {
    const { ids } = req.body;

    const deleted = [];
    const notDeleted = [];

    const items = await FeatureContent.findAll({
      where: { id: { [Op.in]: ids } },
      include: [{ model: FeatureContentIcon, as: 'icon', required: false }]
    });

    for (const item of items) {
      try {
        if (item.icon) {
          await deleteIconFromS3(item.icon.icon_url);
          await FeatureContentIcon.destroy({ where: { id: item.icon_id } });
        }
        await item.destroy();
        deleted.push({ id: item.id, title: item.title });
      } catch (err) {
        notDeleted.push({ id: item.id, title: item.title, reason: err.message || 'Failed to delete' });
      }
    }

    const foundIds = items.map(i => i.id);
    const notFoundIds = ids.filter(id => !foundIds.includes(Number(id)));
    notFoundIds.forEach(id => notDeleted.push({ id: Number(id), reason: 'Feature content not found' }));

    const summary = {
      total_requested: ids.length,
      deleted_count: deleted.length,
      not_deleted_count: notDeleted.length
    };

    if (deleted.length === 0) {
      return errorResponse(res, { deleted, not_deleted: notDeleted, summary }, 'No feature content were deleted', 400);
    }

    return successResponse(res, { deleted, not_deleted: notDeleted, summary }, `Successfully deleted ${deleted.length} item(s)`);
  } catch (error) {
    console.error('Error in bulkDeleteFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to delete feature content');
  }
};

/**
 * Bulk restore soft-deleted feature content by IDs
 */
module.exports.bulkRestoreFeatureContent = async (req, res) => {
  try {
    const { ids } = req.body;

    const restored = [];
    const notRestored = [];

    for (const rawId of ids) {
      const id = Number(rawId);
      try {
        const item = await FeatureContent.findByPk(id, {
          paranoid: false,
          include: [{ model: FeatureContentIcon, as: 'icon', attributes: ['id', 'file_name', 'icon_url', 'createdAt'], required: false }]
        });

        if (!item) {
          notRestored.push({ id, reason: 'Feature content not found' });
          continue;
        }
        if (!item.deletedAt) {
          notRestored.push({ id, title: item.title, reason: 'Feature content is already active (not deleted)' });
          continue;
        }

        await item.restore();
        restored.push({ id: item.id, title: item.title });
      } catch (err) {
        notRestored.push({ id, reason: err.message || 'Failed to restore' });
      }
    }

    const summary = {
      total_requested: ids.length,
      restored_count: restored.length,
      not_restored_count: notRestored.length
    };

    if (restored.length === 0) {
      return errorResponse(res, { restored, not_restored: notRestored, summary }, 'No feature content were restored', 400);
    }

    return successResponse(res, { restored, not_restored: notRestored, summary }, `Successfully restored ${restored.length} item(s)`);
  } catch (error) {
    console.error('Error in bulkRestoreFeatureContent:', error);
    return errorResponse(res, error, error.message || 'Failed to restore feature content');
  }
};

module.exports.getFeatureContentIcons = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sort = 'createdAt', order = 'DESC', deleted } = req.query;
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

    // Convert deleted string to boolean - properly handle undefined, 'true', 'false', '0', '1', true, false
    const showDeleted = deleted === 'true' || deleted === '1' || deleted === true;

    // Add deleted filter to whereCondition
    if (deleted !== undefined) {
      if (showDeleted) {
        // Show only deleted records
        whereCondition.deletedAt = { [Op.ne]: null };
      } else {
        // Show only non-deleted records
        whereCondition.deletedAt = null;
      }
    }

    // Get total count
    const totalCount = await FeatureContentIcon.count({
      where: whereCondition,
      paranoid: false // Always include deleted records when filtering
    });

    // Get paginated results
    const { rows: icons } = await FeatureContentIcon.findAndCountAll({
      where: whereCondition,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      paranoid: false // Always include deleted records when filtering
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

// Delete icon by ID
module.exports.deleteIcon = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the icon
    const icon = await FeatureContentIcon.findByPk(id, {
      paranoid: false
    });

    if (!icon) {
      return errorResponse(res, { message: 'Icon not found' }, 'Icon not found', 404);
    }

    // Check if icon is being used by any feature content
    const featureContentUsingIcon = await FeatureContent.findOne({
      where: { icon_id: id }
    });

    if (featureContentUsingIcon) {
      return errorResponse(res, { 
        message: 'Cannot delete icon. It is currently being used by feature content.' 
      }, 'Icon is in use', 400);
    }

    // Delete icon from S3
    await deleteIconFromS3(icon.icon_url);

    // Delete icon record
    await icon.destroy();

    return successResponse(res, {}, 'Icon deleted successfully');
  } catch (error) {
    console.error('Error in deleteIcon:', error);
    return errorResponse(res, error, error.message || 'Failed to delete icon');
  }
};
