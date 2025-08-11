const { Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { WelcomeContent, User } = require("../../../../models");
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require("../../../../library/s3/s3Helper");

// Handle image upload to S3
const handleImageUpload = async (file) => {
  if (!file) return null;
  
  try {
    const uniqueFileName = generateUniqueFileName(file.originalname);
    const folderPath = 'welcome-content';
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

// Delete image from S3
const deleteImageFromS3 = async (imageUrl) => {
  if (!imageUrl) return;
  
  try {
    const urlParts = imageUrl.split('/');
    const key = urlParts.slice(-2).join('/'); // Get folder/filename from URL
    
    await deleteFile(key);
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    // Don't throw error as this is cleanup operation
  }
};

module.exports.listAllWelcomeContent = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sort = 'createdAt', order = 'DESC', deleted, status } = req.query;
    const offset = (page - 1) * limit;

    let whereCondition = {};
    if (search) {
      whereCondition = {
        [Op.or]: [
          { id: { [Op.like]: `%${search}%` } },
          { title: { [Op.like]: `%${search}%` } },
          { content: { [Op.like]: `%${search}%` } }
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

    // Include user who updated the content
    const includeConditions = [
      {
        model: User,
        as: 'updater',
        attributes: ['id', 'first_name', 'last_name', 'email'],
        required: false
      }
    ];

    // Get total count
    const totalCount = await WelcomeContent.count({
      where: whereCondition,
      include: includeConditions,
      paranoid: false, // Always include deleted records when filtering
      distinct: true
    });

    // Get paginated results
    const { rows: welcomeContents } = await WelcomeContent.findAndCountAll({
      where: whereCondition,
      include: includeConditions,
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      paranoid: false, // Always include deleted records when filtering
      distinct: true
    });

    return successResponse(res, {
      welcomeContents,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error in listAllWelcomeContent:', error);
    return errorResponse(res, 'Failed to retrieve welcome content list', 500);
  }
};

module.exports.getWelcomeContentById = async (req, res) => {
  try {
    const { id } = req.params;

    const welcomeContent = await WelcomeContent.findByPk(id, {
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        }
      ]
    });

    if (!welcomeContent) {
      return errorResponse(res, 'Welcome content not found', 404);
    }

    return successResponse(res, { welcomeContent });
  } catch (error) {
    console.error('Error in getWelcomeContentById:', error);
    return errorResponse(res, 'Failed to retrieve welcome content', 500);
  }
};

module.exports.createOrUpdateWelcomeContent = async (req, res) => {
  try {
    console.log("req.body", req.body);
    const { title, content, status = 'active' } = req.body;
    const userId = req.user.id;

    // Check if welcome content already exists
    let existingWelcomeContent = await WelcomeContent.findOne({
      where: {},
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        }
      ]
    });

    // Handle image upload if provided
    let imageUrl = null;

    if (req.file) {
      imageUrl = await handleImageUpload(req.file);
    }

    let welcomeContent;
    let isCreated = false;

    if (existingWelcomeContent) {
      // Update existing content
      if (req.file && existingWelcomeContent.image_url) {
        // Delete old image if exists
        await deleteImageFromS3(existingWelcomeContent.image_url);
      }

      // Update the content
      await existingWelcomeContent.update({
        title: title || existingWelcomeContent.title,
        content: content || existingWelcomeContent.content,
        status: status || existingWelcomeContent.status,
        image_url: imageUrl || existingWelcomeContent.image_url,
        updated_by: userId
      });

      welcomeContent = existingWelcomeContent;
    } else {
      // Create new content
      welcomeContent = await WelcomeContent.create({
        title,
        content,
        image_url: imageUrl,
        status,
        updated_by: userId
      });

      isCreated = true;
    }

    // Fetch the content with user info
    const finalContent = await WelcomeContent.findByPk(welcomeContent.id, {
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        }
      ]
    });

    const message = isCreated 
      ? 'Welcome content created successfully' 
      : 'Welcome content updated successfully';

    return successResponse(res, { 
      welcomeContent: finalContent,
      message,
      isCreated
    }, isCreated ? 201 : 200);
  } catch (error) {
    console.error('Error in createOrUpdateWelcomeContent:', error);
    return errorResponse(res, 'Failed to create or update welcome content', 500);
  }
};

module.exports.deleteWelcomeContent = async (req, res) => {
  try {
    const { id } = req.params;

    const welcomeContent = await WelcomeContent.findByPk(id);
    if (!welcomeContent) {
      return errorResponse(res, 'Welcome content not found', 404);
    }

    // Delete image from S3 if exists
    if (welcomeContent.image_url) {
      await deleteImageFromS3(welcomeContent.image_url);
    }

    // Soft delete the content
    await welcomeContent.destroy();

    return successResponse(res, { 
      message: 'Welcome content deleted successfully' 
    });
  } catch (error) {
    console.error('Error in deleteWelcomeContent:', error);
    return errorResponse(res, 'Failed to delete welcome content', 500);
  }
};

module.exports.restoreWelcomeContent = async (req, res) => {
  try {
    const { id } = req.params;

    const welcomeContent = await WelcomeContent.findByPk(id, { paranoid: false });
    if (!welcomeContent) {
      return errorResponse(res, 'Welcome content not found', 404);
    }

    if (!welcomeContent.deletedAt) {
      return errorResponse(res, 'Welcome content is not deleted', 400);
    }

    // Restore the content
    await welcomeContent.restore();

    return successResponse(res, { 
      message: 'Welcome content restored successfully' 
    });
  } catch (error) {
    console.error('Error in restoreWelcomeContent:', error);
    return errorResponse(res, 'Failed to restore welcome content', 500);
  }
};

module.exports.getActiveWelcomeContent = async (req, res) => {
  try {
    const welcomeContent = await WelcomeContent.findOne({
      where: { status: 'active' },
      include: [
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          required: false
        }
      ]
    });

    if (!welcomeContent) {
      return errorResponse(res, 'No active welcome content found', 404);
    }

    return successResponse(res, { welcomeContent });
  } catch (error) {
    console.error('Error in getActiveWelcomeContent:', error);
    return errorResponse(res, 'Failed to retrieve active welcome content', 500);
  }
};
