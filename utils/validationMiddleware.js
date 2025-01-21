const { validationResult } = require("express-validator");
const { validationErrorResponse } = require("./responseUtils")

// Validation middleware
module.exports.validateRequest = (validations) => async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Get validation errors
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        // Return custom error response with validation errors
        return validationErrorResponse(res, errors.array(), "Validation failed");
    }

    // Proceed if no errors
    next();
};