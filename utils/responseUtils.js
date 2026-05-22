// responseUtils.js

// Success response function
const successResponse = (res, data, message = "Request successful", statusCode = 200, extra) => {
    const responseBody = {
        success: true,
        message,
        data
    };

    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        Object.assign(responseBody, extra);
    }

    res.status(statusCode).json(responseBody);
};

// Error response function
const errorResponse = (res, error, message, statusCode) => {
    // Prefer the first validation/constraint error message (e.g. "Slug already exists") over generic error.message
    const resolvedMessage = (error?.errors?.[0]?.message) || message || error?.message;
    if (!statusCode) {
        statusCode = error?.statusCode ? error.statusCode : 500;
    }
    const errorData = (error && error.errors) ? error.errors : (error || {});
    res.status(statusCode).json({
        success: false,
        message: resolvedMessage,
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
