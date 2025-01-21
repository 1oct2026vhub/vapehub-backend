// responseUtils.js

// Success response function
const successResponse = (res, data, message = "Request successful", statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        message: message,
        data: data
    });
};

// Error response function
const errorResponse = (res, error, message = "Something went wrong", statusCode = 500) => {
    if (!message) {
        message = error?.errors?.[0]?.message || error.message;
    }
    if (!statusCode) {
        const statusCode = error?.statusCode ? error.statusCode : statusCode
    }
    const errorData = error.errors ? error.errors : error;
    res.status(statusCode).json({
        success: false,
        message: message,
        error: errorData
    });
};

// Validation error response function
const validationErrorResponse = (res, errors, message = "Validation failed", statusCode = 400) => {
    res.status(statusCode).json({
        success: false,
        message: message,
        errors: errors
    });
};
module.exports = { successResponse, errorResponse, validationErrorResponse };
