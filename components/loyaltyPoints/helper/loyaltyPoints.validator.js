const { body } = require("express-validator");

const loyaltyPointsValidator = {
    // Validate order amount for points calculation
    calculatePoints: [
        body("order_amount")
            .isFloat({ min: 0 })
            .withMessage("Order amount must be a positive number")
            .notEmpty()
            .withMessage("Order amount is required")
            .custom((value) => {
                // Check for maximum 2 decimal places
                if (value.toString().includes('.') && value.toString().split('.')[1].length > 2) {
                    throw new Error('Order amount can have maximum 2 decimal places');
                }
                return true;
            })
    ],

    // Validate user ID for user-specific operations
    userId: [
        body("user_id")
            .isInt({ min: 1 })
            .withMessage("User ID must be a positive integer")
            .notEmpty()
            .withMessage("User ID is required")
    ]
};

module.exports = loyaltyPointsValidator; 