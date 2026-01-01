const { validationResult } = require("express-validator");
const { validationErrorResponse } = require("./responseUtils")

// Validation middleware
module.exports.validateRequest = (validations) => async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Get validation errors
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        // Get the first error message, or use default
        const errorMessages = errors.array().map(err => err.msg);
        const message = errorMessages.length > 0 ? errorMessages[0] : "Validation failed";
        
        // Return custom error response with validation errors
        return validationErrorResponse(res, errors.array(), message);
    }

    // Proceed if no errors
    next();
};