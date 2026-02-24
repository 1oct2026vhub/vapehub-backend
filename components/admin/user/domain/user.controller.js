const { v4: uuid } = require('uuid')
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { User, Role, Order, MailSubscription } = require("../../../../models");
const sendEmail = require("../../../../library/sendEmail");
const constants = require('../../../../config/constants');
const bcrypt = require('bcrypt');
const moment = require('moment');
const { Sequelize, Op } = require("sequelize");
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { uploadFiletToS3, generateUniqueFileName, generateSignedUrl, deleteFile } = require('../../../../library/s3/s3Helper');

// Export job status tracking (in-memory, can be moved to Redis/DB)
const exportJobs = new Map();

// Concurrent export limiting
let activeExports = 0;
const MAX_CONCURRENT_EXPORTS = 3;

// Export configuration
const EXPORT_CONFIG = {
    MAX_JOB_TIMEOUT: 2 * 60 * 60 * 1000, // 2 hours max per job
    DB_QUERY_TIMEOUT: 30000, // 30 seconds per query
    CHUNK_DELAY: 100, // 100ms delay between chunks to prevent connection pool exhaustion
    MAX_FILE_SIZE_MEMORY: 50 * 1024 * 1024, // 50MB - files larger use streaming
    S3_UPLOAD_RETRIES: 3, // Retry S3 uploads 3 times
    S3_RETRY_DELAY: 1000 // 1 second base delay for retries
};


module.exports.roles = async (req, res, next) => {
    try {
        let { deleted = "false" } = req.query;

        // Convert deleted query parameter to a boolean
        deleted = deleted === "true";

        // Fetch roles based on the deleted flag
        const roles = await Role.findAll({
            where: { deleted },
        });

        // Check if no roles were found
        if (roles.length === 0) {
            return errorResponse(res, { message: "No roles found" }, "Not Found", 404);
        }

        // Return success response
        return successResponse(res, { roles }, "Roles retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}



//Create a new user
module.exports.createUser = async (req, res) => {
    try {
        const { first_name, last_name, email, password, phone, roleId, gender = 'male', dob = null } = req.body;

        // Check if email already exists
        const existingUser = await User.findOne({
            where: { [Op.or]: [{ email }, phone ? { phone } : null].filter(Boolean) },
        });

        if (existingUser) {
            const errors = {};
            if (existingUser.email === email) {
                errors.email = "User email already exists";
            }
            if (phone && existingUser.phone === phone) {
                errors.phone = "User phone number already exists";
            }

            throw {
                message: "User already exists",
                statusCode: 400,
                errors,
            };
        }
        

        const token = uuid()
        const token_expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours


        const updated_by = req.user?.id ?? null;
        const newUser = await User.create({
            first_name,
            last_name,
            email,
            password: password,
            phone,
            roleId,
            gender,
            dob,
            token,
            token_expiry,
            ...(updated_by != null && { updated_by })
        });

        if(newUser){
            const username = newUser?.first_name ?? newUser.email.split('@')[0];
            
            const data = {
                emailTypes: constants.emailTypes.REGISTER,
                to: newUser.email,
                context: {
                    userName: username,
                    verificationLink: `${process.env.ADMIN_FRONTEND_URL}/email-verify?token=${token}`,
                    expiryTime: moment(token_expiry).format('LLLL'),
                },
                attachments: ""
            }
            await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

            return successResponse(res, { newUser }, "User created successfully", 200);
        }
        else{
            throw {
                message: "Failed to create user",
                statusCode: 400,
                errors: { email: "Failed to create user" },
            }
        }

        
    } catch (error) {
        console.error("Error creating user:", error);
        return errorResponse(res, error);
    }
};

// Update an existing user
module.exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, password, phone, roleId, gender, dob } = req.body;

        // Find the user
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Check if phone number already exists for another user
        if (phone) {
            const existingUser = await User.findOne({
                where: { phone, id: { [Op.ne]: id } }, // Ensure it's not the same user
            });

            if (existingUser) {
                return res.status(400).json({
                    message: "Phone number already exists",
                    errors: { phone: "This phone number is already in use by another user" },
                });
            }
        }

        // Update fields
        if (first_name) user.first_name = first_name;
        if (last_name) user.last_name = last_name;
        // if (email) user.email = email;
        if (phone) user.phone = phone;
        if (roleId) user.roleId = roleId;
        if (gender) user.gender = gender;
        if (dob) user.dob = dob;
        if (password){
            const hashedPassword = await bcrypt.hashSync(password, 10);
            user.password = hashedPassword;
        }
        const updated_by = req.user?.id ?? null;
        if (updated_by != null) user.updated_by = updated_by;

        await user.save();

        return successResponse(res, { user }, "User updated successfully", 200);
    } catch (error) {
        console.error("Error updating user:", error);
        return errorResponse(res, error);
    }
};

//List all users (with pagination)
module.exports.listUsers = async (req, res) => {
    try {
        const { 
            sort_by = 'createdAt', 
            order = 'DESC', 
            page = 1, 
            limit = 10, 
            roleId, 
            search, 
            deleted = "false",
            blocked = "all",
            verified = "all" 
        } = req.query;

        // Validate sort_by parameter and set default if invalid
        const allowedSortFields = [
            'id', 'first_name', 'last_name', 'email', 'phone', 
            'gender', 'createdAt', 'updatedAt', 'deletedAt',
            'email_verified_at', 'blocked'
        ];
        
        const validatedSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'createdAt';

        // Validate order parameter and set default if invalid
        const validOrders = ['ASC', 'DESC'];
        const validatedOrder = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

        const offset = (page - 1) * limit;
        const whereCondition = {};

        // Check if the requesting user is a super user
        const requestingUser = req.user;
        if (!requestingUser.super_user) {
            // If not a super user, exclude super users from the results
            whereCondition.super_user = false;
        }

        // Exclude guest users (temporary users)
        whereCondition.is_temporary = false;

        // Filter by roleId if provided
        if (roleId) {
            whereCondition.roleId = roleId;
        }

        // Search by first name, last name, email, phone number, or gender
        if (search) {
            whereCondition[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
                { gender: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by deleted flag
        if (deleted !== undefined && deleted !== "all") {
            if (deleted === "true") {
                whereCondition.deletedAt = { [Op.ne]: null };
            } else {
                whereCondition.deletedAt = null;
            }
        }

        // Filter by blocked status
        if (blocked !== undefined && blocked !== "all") {
            whereCondition.blocked = blocked === true || blocked === "true";
        }

        // Add email verification filter
        if (verified !== "all") {
            whereCondition.email_verified_at = verified === "true" ? 
                { [Op.ne]: null } : // For verified emails
                null;              // For unverified emails
        }

        const users = await User.findAndCountAll({
            where: whereCondition,
            include: [{ model: Role, as: "roles", attributes: ["id", "role"] }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[validatedSortBy, validatedOrder]],
            paranoid: false,
        });

        return successResponse(res, {  
            total: users.count,
            page: parseInt(page),
            limit: parseInt(limit),
            users: users.rows }, 
            "Users retrieved successfully", 200);

    } catch (error) {
        console.error("Error listing users:", error);
        return errorResponse(res, error);
    }
};

//Soft Delete a User
module.exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const requestingUser = req.user;

        const user = await User.findByPk(id);
        if (!user) {
            return errorResponse(res, { message: "User not found" }, 404);
        }

        // Check if requesting user has permission to delete the target user
        if (!requestingUser.super_user && user.super_user) {
            return errorResponse(res, { message: "You don't have permission to delete a super user" }, 403);
        }

        // Check for existing orders with specific statuses
        const restrictedStatuses = [
            constants.orderStatus.PENDING,
            constants.orderStatus.PROCESSING,
            constants.orderStatus.PACKED,
            constants.orderStatus.SHIPPED,
            constants.orderStatus.OUT_FOR_DELIVERY,
            constants.orderStatus.RETURN_REQUESTED,
            constants.orderStatus.RETURN_RECEIVED
        ];

        const existingOrders = await Order.findAll({
            where: {
                user_id: id,
                status: {
                    [Op.in]: restrictedStatuses
                }
            }
        });

        if (existingOrders.length > 0) {
            return errorResponse(res, { 
                message: "Cannot delete user. User has active orders that are pending, processing, packed, shipped, out for delivery, or in return process." 
            }, 400);
        }

        // Soft delete all mail subscriptions associated with this user
        const mailSubscriptions = await MailSubscription.findAll({
            where: { user_id: id }
        });
        for (const subscription of mailSubscriptions) {
            await subscription.destroy();
        }

        if (requestingUser?.id != null) user.updated_by = requestingUser.id;
        await user.save();
        await user.destroy(); // Soft delete enabled because `paranoid: true`
        return successResponse(res, { }, "User deleted successfully", 200);
    } catch (error) {
        console.error("Error deleting user:", error);
        return errorResponse(res, error);
    }
};

// Restore a soft-deleted user
module.exports.restoreUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findOne({
            where: { id },
            paranoid: false // Allows retrieving soft-deleted records
        });
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        await user.restore(); // Restores the soft-deleted user
        return successResponse(res, { }, "User restored successfully", 200);
    } catch (error) {
        console.error("Error restoring user:", error);
        return errorResponse(res, error);
    }
};

//Block a User
module.exports.blockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const requestingUser = req.user;

        const user = await User.findByPk(id);
        if (!user) {            
            return errorResponse(res, { message: "User not found" }, 404);
        }
        if (user.blocked) {            
            return errorResponse(res, { message: "User is already blocked" }, 400);
        }

        // Check if requesting user has permission to block the target user
        if (!requestingUser.super_user && user.super_user) {
            return errorResponse(res, { message: "You don't have permission to block a super user" }, 403);
        }

        // Check if requesting user is trying to block themselves
        if (requestingUser.id === user.id) {
            return errorResponse(res, { message: "You cannot block yourself" }, 400);
        }

        user.blocked = true;
        if (requestingUser?.id != null) user.updated_by = requestingUser.id;
        await user.save();
        return successResponse(res, { }, "User blocked successfully", 200);
    } catch (error) {
        console.error("Error blocking user:", error);
        return errorResponse(res, error);
    }
};

//Unblock a User
module.exports.unblockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const requestingUser = req.user;
        
        const user = await User.findByPk(id);

        if (!user) {            
            return errorResponse(res, { message: "User not found" }, 404);
        }
        
        if (!user.blocked) {            
            return errorResponse(res, { message: "User is active" }, 400);
        }

        // Check if requesting user has permission to unblock the target user
        if (!requestingUser.super_user && user.super_user) {
            return errorResponse(res, { message: "You don't have permission to unblock a super user" }, 403);
        }
        
        user.blocked = false;
        if (requestingUser?.id != null) user.updated_by = requestingUser.id;
        await user.save();

        return successResponse(res, { }, "User unblocked successfully", 200);
    } catch (error) {
        console.error("Error unblocking user:", error);
        return errorResponse(res, error);
    }
};

// Helper function to build where condition for exports
async function buildExportWhereCondition(requestingUser, filters) {
    const { search, deleted, blocked, verified, start_date, end_date } = filters;
    const whereCondition = {};

    // Validate requestingUser
    if (!requestingUser) {
        throw new Error('Requesting user is required');
    }

    // Check if the requesting user is a super user
    if (!requestingUser.super_user) {
        whereCondition.super_user = false;
    }
    
    // Fetch admin roles and exclude them (similar to customer controller)
    try {
        const adminRoles = await Role.findAll({
            where: { deleted: false, is_admin_panel: true },
            timeout: EXPORT_CONFIG.DB_QUERY_TIMEOUT
        });
        const adminRoleIds = adminRoles.map(role => role.id);
        if (adminRoleIds.length > 0) {
            whereCondition.roleId = { [Op.notIn]: adminRoleIds };
        }
    } catch (roleError) {
        console.error("Error fetching admin roles for export:", roleError);
        // Continue without admin role exclusion if query fails (fail-safe)
        // This ensures export can still proceed even if role query fails
    }

    // Search filter
    if (search) {
        whereCondition[Op.or] = [
            { first_name: { [Op.like]: `%${search}%` } },
            { last_name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
            { phone: { [Op.like]: `%${search}%` } }
        ];
    }

    // Filter by deleted flag (soft delete handling)
    if (deleted !== undefined && deleted !== "all") {
        if (deleted === "true") {
            // Include only soft-deleted users
            whereCondition.deletedAt = { [Op.ne]: null };
        } else {
            // Exclude soft-deleted users (default)
            whereCondition.deletedAt = null;
        }
    }

    // Filter by blocked status
    if (blocked !== undefined && blocked !== "all") {
        whereCondition.blocked = blocked === true || blocked === "true";
    }

    // Filter by email verification
    if (verified !== undefined && verified !== "all") {
        whereCondition.email_verified_at = verified === "true" ? 
            { [Op.ne]: null } : null;
    }

    // Date range filter with validation
    if (start_date && end_date) {
        const startMoment = moment(start_date);
        const endMoment = moment(end_date);
        
        // Validate dates
        if (!startMoment.isValid()) {
            throw new Error(`Invalid start_date format: ${start_date}. Please use a valid date format (e.g., YYYY-MM-DD)`);
        }
        if (!endMoment.isValid()) {
            throw new Error(`Invalid end_date format: ${end_date}. Please use a valid date format (e.g., YYYY-MM-DD)`);
        }
        
        // Ensure end date is after start date
        if (endMoment.isBefore(startMoment)) {
            throw new Error('end_date must be after or equal to start_date');
        }
        
        whereCondition.createdAt = {
            [Op.between]: [startMoment.startOf('day').toDate(), endMoment.endOf('day').toDate()]
        };
    } else if (start_date || end_date) {
        // If only one date is provided, throw error
        throw new Error('Both start_date and end_date must be provided together');
    }

    return whereCondition;
}

// Initiate export job (background processing for large datasets)
module.exports.initiateUserExport = async (req, res) => {
    let jobStarted = false;
    try {
        // Validate user
        if (!req.user || !req.user.id) {
            return errorResponse(res, { message: "User authentication required" }, "Unauthorized", 401);
        }

        // Validate S3 configuration
        if (!process.env.AWS_S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            return errorResponse(res, { 
                message: "S3 configuration is missing. Export functionality is unavailable." 
            }, "Configuration Error", 500);
        }

        // Check concurrent export limit
        if (activeExports >= MAX_CONCURRENT_EXPORTS) {
            return errorResponse(res, {
                message: "Too many export jobs running. Please wait and try again.",
                activeExports,
                maxConcurrent: MAX_CONCURRENT_EXPORTS
            }, "Too Many Requests", 429);
        }

        const { 
            format = 'excel',
            search, 
            deleted = "false",
            blocked = "all",
            verified = "all",
            start_date,
            end_date
        } = req.query;

        // Validate format
        if (format !== 'csv' && format !== 'excel') {
            return errorResponse(res, { 
                message: "Invalid format. Must be 'csv' or 'excel'" 
            }, "Bad Request", 400);
        }

        // Build where condition - excludes admin users (roleId = 1) by default
        let whereCondition;
        try {
            whereCondition = await buildExportWhereCondition(req.user, {
                search, deleted, blocked, verified, start_date, end_date
            });
        } catch (filterError) {
            console.error("Error building export filters:", filterError);
            return errorResponse(res, { 
                message: filterError.message || "Failed to build export filters. Please check your filter parameters."
            }, "Bad Request", 400);
        }

        // Get total count with timeout
        let totalCount;
        try {
            totalCount = await User.count({
                where: whereCondition,
                paranoid: false,
                timeout: EXPORT_CONFIG.DB_QUERY_TIMEOUT
            });
        } catch (dbError) {
            console.error("Database error in export count:", dbError);
            return errorResponse(res, { 
                message: "Failed to count users. Please try again." 
            }, "Database Error", 500);
        }

        if (totalCount === 0) {
            return errorResponse(res, { message: "No users found to export" }, "Not Found", 404);
        }

        // Generate unique job ID
        const jobId = `user-export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Store initial job status
        storeJobStatus(jobId, 'processing', null, null, totalCount, format, req.user.id);
        
        // Increment active exports counter BEFORE starting job
        activeExports++;
        jobStarted = true;
        
        // Process export in background (non-blocking)
        processExportInBackground(jobId, whereCondition, format, totalCount, req.user.id)
            .then(result => {
                activeExports = Math.max(0, activeExports - 1); // Ensure never negative
                storeJobStatus(jobId, 'completed', result.downloadUrl, null, totalCount, format, req.user.id, result.s3Key);
                console.log(`Export job ${jobId} completed successfully`);
            })
            .catch(error => {
                activeExports = Math.max(0, activeExports - 1); // Ensure never negative
                storeJobStatus(jobId, 'failed', null, error.message, totalCount, format, req.user.id, null);
                console.error(`Export job ${jobId} failed:`, error);
            });

        return successResponse(res, {
            jobId,
            status: 'processing',
            totalRecords: totalCount,
            format,
            message: 'Export job initiated. File will be available for download when ready.'
        }, "Export job started successfully", 202);

    } catch (error) {
        console.error("Error initiating export:", error);
        // Decrement counter if job was started
        if (jobStarted) {
            activeExports = Math.max(0, activeExports - 1);
        }
        return errorResponse(res, error, error.message);
    }
};

// Background processing function with timeout protection
async function processExportInBackground(jobId, whereCondition, format, totalCount, userId) {
    const CHUNK_SIZE = 5000; // Process 5000 records per chunk
    const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
    const tempDir = os.tmpdir();
    const tempFileName = `${jobId}.${format === 'csv' ? 'csv' : 'xlsx'}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    // Set overall timeout for the job
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Export job ${jobId} timed out after ${EXPORT_CONFIG.MAX_JOB_TIMEOUT / 1000 / 60} minutes`));
        }, EXPORT_CONFIG.MAX_JOB_TIMEOUT);
    });

    const exportPromise = (async () => {
        try {
            console.log(`Starting export job ${jobId} for ${totalCount} users (${totalChunks} chunks)`);

            if (format === 'csv') {
                await processCSVExport(whereCondition, tempFilePath, CHUNK_SIZE, totalChunks);
            } else {
                await processExcelExport(whereCondition, tempFilePath, CHUNK_SIZE, totalChunks);
            }

            // Verify file was created successfully
            if (!fs.existsSync(tempFilePath)) {
                throw new Error('Export file was not created successfully');
            }

            // Check file size before reading into memory
            let fileStats;
            try {
                fileStats = fs.statSync(tempFilePath);
            } catch (statError) {
                throw new Error(`Failed to read export file: ${statError.message}`);
            }
            
            const fileSize = fileStats.size;
            
            if (fileSize === 0) {
                throw new Error('Export file is empty');
            }

            // Upload to S3 with memory-safe handling
            const s3Key = `exports/users/${tempFileName}`;
            const contentType = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            
            let uploadResult;
            if (fileSize > EXPORT_CONFIG.MAX_FILE_SIZE_MEMORY) {
                // Use streaming upload for large files
                uploadResult = await uploadLargeFileToS3(tempFilePath, s3Key, contentType);
            } else {
                // Read into memory for smaller files
                let fileBuffer;
                try {
                    fileBuffer = fs.readFileSync(tempFilePath);
                } catch (readError) {
                    throw new Error(`Failed to read export file for upload: ${readError.message}`);
                }
                
                if (!fileBuffer || fileBuffer.length === 0) {
                    throw new Error('Export file is empty or could not be read');
                }
                
                const uploadParams = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: s3Key,
                    Body: fileBuffer,
                    ContentType: contentType,
                    ContentDisposition: `attachment; filename=users-export-${moment().format('YYYY-MM-DD')}.${format === 'csv' ? 'csv' : 'xlsx'}`
                };
                uploadResult = await uploadWithRetry(uploadParams);
            }
            
            // Clean up temp file
            cleanupTempFile(tempFilePath);

            if (!uploadResult || !uploadResult.Location) {
                throw new Error('Failed to upload file to S3');
            }

        // Generate signed URL (valid for 7 days - hardcoded in s3Helper)
        let signedUrl;
        try {
            signedUrl = await generateSignedUrl(s3Key);
        } catch (urlError) {
            throw new Error(`Failed to generate download URL: ${urlError.message}`);
        }
        
        if (!signedUrl) {
            throw new Error('Generated signed URL is empty');
        }

            console.log(`Export ${jobId} completed successfully. Download URL generated.`);

            // Clear timeout if export completes early
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            return { jobId, status: 'completed', downloadUrl: signedUrl, s3Key };

        } catch (error) {
            console.error(`Export job ${jobId} failed:`, error);
            // Clear timeout on error
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            // Clean up on error
            cleanupTempFile(tempFilePath);
            throw error;
        }
    })();

    // Race between export and timeout
    try {
        return await Promise.race([exportPromise, timeoutPromise]);
    } catch (error) {
        // Ensure timeout is cleared
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        throw error;
    }
}

// Memory-safe upload for large files using streaming
async function uploadLargeFileToS3(filePath, s3Key, contentType) {
    const s3 = require('../../../../config/awsConfig');
    
    // Verify file exists before creating stream
    if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
    }
    
    const readStream = fs.createReadStream(filePath);
    
    // Handle stream errors
    readStream.on('error', (err) => {
        console.error('Error reading file stream:', err);
    });
    
    const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: readStream,
        ContentType: contentType,
        ContentDisposition: `attachment; filename=users-export-${moment().format('YYYY-MM-DD')}.${s3Key.split('.').pop()}`
    };

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            readStream.destroy();
            reject(new Error('S3 upload timeout after 10 minutes'));
        }, 10 * 60 * 1000); // 10 minute timeout for large uploads
        
        s3.upload(uploadParams, (err, data) => {
            clearTimeout(timeoutId);
            if (err) {
                readStream.destroy();
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

// Retry mechanism for S3 uploads
async function uploadWithRetry(uploadParams, maxRetries = EXPORT_CONFIG.S3_UPLOAD_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await uploadFiletToS3(uploadParams);
        } catch (error) {
            if (attempt === maxRetries) {
                throw new Error(`S3 upload failed after ${maxRetries} attempts: ${error.message}`);
            }
            console.log(`S3 upload attempt ${attempt} failed, retrying in ${EXPORT_CONFIG.S3_RETRY_DELAY * attempt}ms...`);
            await new Promise(resolve => setTimeout(resolve, EXPORT_CONFIG.S3_RETRY_DELAY * attempt));
        }
    }
}

// Cleanup temp file safely
function cleanupTempFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error(`Error cleaning up temp file ${filePath}:`, error);
    }
}

// Store job status
function storeJobStatus(jobId, status, downloadUrl = null, error = null, totalRecords = null, format = null, userId = null, s3Key = null) {
    exportJobs.set(jobId, {
        jobId,
        status,
        downloadUrl,
        error,
        totalRecords,
        format,
        userId,
        s3Key, // Store S3 key for cleanup
        createdAt: exportJobs.get(jobId)?.createdAt || new Date(),
        updatedAt: new Date()
    });
    
    // Clean up old completed/failed jobs (keep last 100)
    if (exportJobs.size > 100) {
        const entries = Array.from(exportJobs.entries());
        entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
        const toKeep = entries.slice(0, 100);
        exportJobs.clear();
        toKeep.forEach(([key, value]) => exportJobs.set(key, value));
    }
}

// CSV Export with streaming to file
async function processCSVExport(whereCondition, filePath, chunkSize, totalChunks) {
    const csvFields = ['First Name', 'Last Name', 'Email', 'Phone'];
    const parser = new Parser({ fields: csvFields });
    
    const writeStream = fs.createWriteStream(filePath, { flags: 'w' });
    
    // Handle stream errors
    writeStream.on('error', (err) => {
        console.error('Error writing to CSV file:', err);
    });
    
    // Write header
    try {
        writeStream.write(parser.parse([]).split('\n')[0] + '\n');
    } catch (headerError) {
        writeStream.destroy();
        throw new Error(`Failed to write CSV header: ${headerError.message}`);
    }

    // Process in chunks using cursor-based pagination (more efficient)
    let lastId = 0;
    let processedCount = 0;
    
    try {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            let users;
            try {
                users = await User.findAll({
                    where: {
                        ...whereCondition,
                        id: { [Op.gt]: lastId }
                    },
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone'],
                    limit: chunkSize,
                    order: [['id', 'ASC']],
                    paranoid: false,
                    raw: true,
                    timeout: EXPORT_CONFIG.DB_QUERY_TIMEOUT
                });
            } catch (dbError) {
                writeStream.destroy();
                throw new Error(`Database query failed at chunk ${chunkIndex + 1}: ${dbError.message}`);
            }

            if (users.length === 0) break;

            // Add delay between chunks to prevent connection pool exhaustion
            if (chunkIndex < totalChunks - 1) {
                await new Promise(resolve => setTimeout(resolve, EXPORT_CONFIG.CHUNK_DELAY));
            }

            // Format and write chunk
            try {
                const csvData = users.map(user => ({
                    'First Name': user.first_name || '',
                    'Last Name': user.last_name || '',
                    'Email': user.email || '',
                    'Phone': user.phone || ''
                }));

                const csvChunk = parser.parse(csvData);
                const lines = csvChunk.split('\n');
                lines.shift(); // Remove header
                const writeSuccess = writeStream.write(lines.join('\n') + '\n');
                
                // Handle backpressure
                if (!writeSuccess) {
                    await new Promise((resolve) => writeStream.once('drain', resolve));
                }
            } catch (writeError) {
                writeStream.destroy();
                throw new Error(`Failed to write CSV chunk ${chunkIndex + 1}: ${writeError.message}`);
            }

            lastId = users[users.length - 1].id;
            processedCount += users.length;

            // Log progress
            if (chunkIndex % 10 === 0 || chunkIndex === totalChunks - 1) {
                console.log(`Export progress: ${chunkIndex + 1}/${totalChunks} chunks (${processedCount}/${totalChunks * chunkSize} records)`);
            }
        }
    } catch (error) {
        writeStream.destroy();
        throw error;
    }

    writeStream.end();
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            writeStream.destroy();
            reject(new Error('CSV file write timeout'));
        }, 5 * 60 * 1000); // 5 minute timeout
        
        writeStream.on('finish', () => {
            clearTimeout(timeoutId);
            resolve();
        });
        writeStream.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

// Excel Export with chunking
async function processExcelExport(whereCondition, filePath, chunkSize, totalChunks) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Users');

    worksheet.columns = [
        { header: 'First Name', key: 'first_name', width: 20 },
        { header: 'Last Name', key: 'last_name', width: 20 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Phone', key: 'phone', width: 20 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    // Process in chunks using cursor-based pagination
    let lastId = 0;
    let processedCount = 0;

    try {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            let users;
            try {
                users = await User.findAll({
                    where: {
                        ...whereCondition,
                        id: { [Op.gt]: lastId }
                    },
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone'],
                    limit: chunkSize,
                    order: [['id', 'ASC']],
                    paranoid: false,
                    raw: true,
                    timeout: EXPORT_CONFIG.DB_QUERY_TIMEOUT
                });
            } catch (dbError) {
                throw new Error(`Database query failed at chunk ${chunkIndex + 1}: ${dbError.message}`);
            }

            if (users.length === 0) break;

            // Add delay between chunks to prevent connection pool exhaustion
            if (chunkIndex < totalChunks - 1) {
                await new Promise(resolve => setTimeout(resolve, EXPORT_CONFIG.CHUNK_DELAY));
            }

            // Add rows with error handling
            try {
                users.forEach(user => {
                    worksheet.addRow({
                        first_name: user.first_name || '',
                        last_name: user.last_name || '',
                        email: user.email || '',
                        phone: user.phone || ''
                    });
                });
            } catch (rowError) {
                throw new Error(`Failed to add rows at chunk ${chunkIndex + 1}: ${rowError.message}`);
            }

            lastId = users[users.length - 1].id;
            processedCount += users.length;

            // Log progress
            if (chunkIndex % 10 === 0 || chunkIndex === totalChunks - 1) {
                console.log(`Export progress: ${chunkIndex + 1}/${totalChunks} chunks (${processedCount}/${totalChunks * chunkSize} records)`);
            }
        }

        // Write file with timeout
        await Promise.race([
            workbook.xlsx.writeFile(filePath),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Excel file write timeout')), 10 * 60 * 1000)
            )
        ]);
    } catch (error) {
        throw error;
    }
}

// Direct streaming export (for smaller datasets < 100k)
module.exports.exportUsersStream = async (req, res) => {
    let headersSent = false;
    try {
        // Validate user
        if (!req.user || !req.user.id) {
            return errorResponse(res, { message: "User authentication required" }, "Unauthorized", 401);
        }

        const { 
            format = 'csv',
            roleId, 
            search, 
            deleted = "false",
            blocked = "all",
            verified = "all",
            start_date,
            end_date
        } = req.query;

        // Build where condition
        const whereCondition = buildExportWhereCondition(req.user, {
            roleId, search, deleted, blocked, verified, start_date, end_date
        });
        
        let totalCount;
        try {
            totalCount = await User.count({ 
                where: whereCondition, 
                paranoid: false,
                timeout: EXPORT_CONFIG.DB_QUERY_TIMEOUT
            });
        } catch (dbError) {
            return errorResponse(res, { 
                message: "Failed to count users. Please try again." 
            }, "Database Error", 500);
        }
        
        // For very large datasets, redirect to background job
        if (totalCount > 100000) {
            return errorResponse(res, { 
                message: "Dataset too large for direct export. Please use the background export endpoint.",
                totalRecords: totalCount,
                suggestion: "Use /api/admin/user/export/initiate endpoint"
            }, "Dataset too large", 400);
        }

        // Set headers BEFORE any data processing
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=users-export-${moment().format('YYYY-MM-DD')}.csv`);
            headersSent = true;
            
            // Write CSV header
            const parser = new Parser({ fields: ['First Name', 'Last Name', 'Email', 'Phone'] });
            try {
                res.write(parser.parse([]).split('\n')[0] + '\n');
            } catch (headerError) {
                if (!res.headersSent) {
                    return errorResponse(res, { 
                        message: "Failed to write CSV header" 
                    }, "Export Error", 500);
                }
                throw headerError;
            }
        } else {
            // For Excel, use background job for better performance
            return errorResponse(res, { 
                message: "For Excel exports, please use the background export endpoint for better performance.",
                suggestion: "Use /api/admin/user/export/initiate?format=excel"
            }, "Use background export", 400);
        }

        // Stream data using cursor-based pagination
        const CHUNK_SIZE = 5000;
        let lastId = 0;
        let hasMore = true;
        const parser = new Parser({ fields: ['First Name', 'Last Name', 'Email', 'Phone'] });

        // Handle client disconnect
        req.on('close', () => {
            if (!res.headersSent) {
                console.log('Client disconnected during export stream');
            }
        });

        while (hasMore) {
            let users;
            try {
                users = await User.findAll({
                    where: { ...whereCondition, id: { [Op.gt]: lastId } },
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone'],
                    limit: CHUNK_SIZE,
                    order: [['id', 'ASC']],
                    paranoid: false,
                    raw: true,
                    timeout: EXPORT_CONFIG.DB_QUERY_TIMEOUT
                });
            } catch (dbError) {
                if (!res.headersSent) {
                    return errorResponse(res, { 
                        message: "Database query failed during export" 
                    }, "Database Error", 500);
                }
                // If headers already sent, we can't send error response
                console.error("Database error during stream:", dbError);
                res.end();
                return;
            }

            if (users.length === 0) {
                hasMore = false;
                break;
            }

            try {
                const csvData = users.map(u => ({
                    'First Name': u.first_name || '',
                    'Last Name': u.last_name || '',
                    'Email': u.email || '',
                    'Phone': u.phone || ''
                }));

                const csvChunk = parser.parse(csvData);
                const lines = csvChunk.split('\n');
                lines.shift(); // Remove header
                res.write(lines.join('\n') + '\n');
            } catch (writeError) {
                if (!res.headersSent) {
                    return errorResponse(res, { 
                        message: "Failed to format export data" 
                    }, "Export Error", 500);
                }
                console.error("Error writing chunk:", writeError);
                res.end();
                return;
            }

            lastId = users[users.length - 1].id;
        }
        
        res.end();
        return;

    } catch (error) {
        console.error("Error streaming export:", error);
        if (!headersSent && !res.headersSent) {
            return errorResponse(res, error, error.message);
        } else {
            // Headers already sent, can't send error response
            console.error("Error after headers sent, ending response");
            if (!res.finished) {
                res.end();
            }
        }
    }
};

// Check export job status
module.exports.checkExportStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        
        const job = exportJobs.get(jobId);
        
        if (!job) {
            return errorResponse(res, {
                message: "Export job not found. It may have expired or never existed.",
                jobId
            }, "Not Found", 404);
        }
        
        return successResponse(res, {
            jobId: job.jobId,
            status: job.status,
            downloadUrl: job.downloadUrl,
            error: job.error,
            totalRecords: job.totalRecords,
            format: job.format,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt
        }, "Export status retrieved");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Graceful shutdown handling - cleanup temp files
process.on('SIGTERM', () => {
    console.log('SIGTERM received, cleaning up export temp files...');
    cleanupAllTempFiles();
});

process.on('SIGINT', () => {
    console.log('SIGINT received, cleaning up export temp files...');
    cleanupAllTempFiles();
    process.exit(0);
});

// Cleanup all temp files on shutdown
function cleanupAllTempFiles() {
    try {
        const tempDir = os.tmpdir();
        const files = fs.readdirSync(tempDir);
        let cleaned = 0;
        
        files.forEach(file => {
            if (file.startsWith('user-export-') && (file.endsWith('.csv') || file.endsWith('.xlsx'))) {
                try {
                    const filePath = path.join(tempDir, file);
                    // Only delete files older than 1 hour
                    const stats = fs.statSync(filePath);
                    const age = Date.now() - stats.mtimeMs;
                    if (age > 60 * 60 * 1000) { // 1 hour
                        fs.unlinkSync(filePath);
                        cleaned++;
                    }
                } catch (err) {
                    // Ignore errors during cleanup
                }
            }
        });
        
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old export temp files`);
        }
    } catch (error) {
        console.error('Error during temp file cleanup:', error);
    }
}

// Cleanup old export files from S3
async function cleanupOldExportFiles() {
    try {
        const EXPORT_FILE_RETENTION_HOURS = 24; // Delete files after 24 hours
        const cutoffDate = moment().subtract(EXPORT_FILE_RETENTION_HOURS, 'hours').toDate();
        
        console.log(`Starting cleanup of export files older than ${EXPORT_FILE_RETENTION_HOURS} hours...`);
        
        let deletedCount = 0;
        let errorCount = 0;
        const filesToDelete = [];
        
        // Find all completed jobs older than retention period
        exportJobs.forEach((job, jobId) => {
            if (job.status === 'completed' && job.s3Key && job.createdAt < cutoffDate) {
                filesToDelete.push({
                    jobId,
                    s3Key: job.s3Key,
                    createdAt: job.createdAt
                });
            }
        });
        
        console.log(`Found ${filesToDelete.length} export files to delete from job tracking`);
        
        // Delete files from S3
        for (const file of filesToDelete) {
            try {
                await deleteFile(file.s3Key);
                deletedCount++;
                
                // Remove from job tracking
                exportJobs.delete(file.jobId);
                
                console.log(`✅ Deleted export file: ${file.s3Key}`);
            } catch (error) {
                errorCount++;
                console.error(`❌ Error deleting file ${file.s3Key}:`, error.message);
            }
        }
        
        // Also cleanup S3 directly (in case job tracking is lost)
        // Convert hours to days for the function (24 hours = 1 day)
        const directCleanupResult = await cleanupS3ExportFilesDirectly(EXPORT_FILE_RETENTION_HOURS / 24);
        
        console.log(`Cleanup completed: ${deletedCount} files deleted from tracking, ${directCleanupResult.deleted} from S3 directly, ${errorCount} errors`);
        
        return {
            deleted: deletedCount + directCleanupResult.deleted,
            errors: errorCount + directCleanupResult.errors,
            total: filesToDelete.length + directCleanupResult.total
        };
        
    } catch (error) {
        console.error('Error in cleanupOldExportFiles:', error);
        throw error;
    }
}

// Direct S3 cleanup (backup method - scans S3 bucket directly)
async function cleanupS3ExportFilesDirectly(retentionDays) {
    try {
        // Validate S3 configuration
        if (!process.env.AWS_S3_BUCKET) {
            console.warn('S3 bucket not configured, skipping direct cleanup');
            return { deleted: 0, errors: 0, total: 0 };
        }

        const s3 = require('../../../../config/awsConfig');
        const cutoffDate = moment().subtract(retentionDays, 'days').toDate();
        
        // List all files in exports/users/ folder
        const listParams = {
            Bucket: process.env.AWS_S3_BUCKET,
            Prefix: 'exports/users/'
        };
        
        let listedObjects;
        try {
            listedObjects = await s3.listObjectsV2(listParams).promise();
        } catch (listError) {
            console.error('Error listing S3 objects:', listError);
            return { deleted: 0, errors: 1, total: 0 };
        }
        
        if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
            return { deleted: 0, errors: 0, total: 0 };
        }
        
        const filesToDelete = [];
        
        for (const object of listedObjects.Contents) {
            // Check if file is older than retention period
            if (object.LastModified < cutoffDate) {
                filesToDelete.push({ Key: object.Key });
            }
        }
        
        if (filesToDelete.length === 0) {
            return { deleted: 0, errors: 0, total: 0 };
        }
        
        console.log(`Found ${filesToDelete.length} old export files in S3 to delete`);
        
        let deleted = 0;
        let errors = 0;
        
        // Delete files in batches (S3 allows max 1000 per request)
        const batchSize = 1000;
        for (let i = 0; i < filesToDelete.length; i += batchSize) {
            const batch = filesToDelete.slice(i, i + batchSize);
            
            try {
                const deleteParams = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Delete: {
                        Objects: batch,
                        Quiet: true
                    }
                };
                
                await s3.deleteObjects(deleteParams).promise();
                deleted += batch.length;
                console.log(`✅ Deleted ${batch.length} old export files from S3`);
            } catch (error) {
                errors += batch.length;
                console.error(`❌ Error deleting batch from S3:`, error.message);
            }
        }
        
        return { deleted, errors, total: filesToDelete.length };
        
    } catch (error) {
        console.error('Error in direct S3 cleanup:', error);
        // Don't throw - this is a backup cleanup method
        return { deleted: 0, errors: 1, total: 0 };
    }
}

// Export cleanup function for manual/cron use
module.exports.cleanupOldExportFiles = cleanupOldExportFiles;