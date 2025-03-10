const { check, query } = require("express-validator");
const { forgotPassword } = require("../domain/auth.controller");

const authValidation = {
    login: [
        check("email").isEmail().withMessage("Invalid Email").notEmpty().withMessage("Email is required"),
        check("password").notEmpty().withMessage("Invalid Password")
        .isLength({ min: 8 }).withMessage("Invalid Password")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/).withMessage("Invalid Password"),
    ],
    emailVerify: [
        query("token").isString().notEmpty().withMessage("Token is required in query params")
    ],
    forgotPassword: [
      check('email')
        .isEmail()
        .withMessage('Please provide a valid email address.')
        .normalizeEmail(),
    ],
    resetPassword: [
        check('token').isString().notEmpty().withMessage('Token is required in query params'),
        check("password")
            .notEmpty().withMessage("Password is required")
            .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
            .withMessage("Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character"),
        check("confirmPassword")
            .notEmpty().withMessage("Confirm password is required")
            .custom((value, { req }) => {
                if (value !== req.body.password) {
                    throw new Error("Password and confirm password do not match");
                }
                return true;
            }),
    ],
    refreshToken: [
        check('refreshToken').isString().notEmpty().withMessage('refreshToken is required in request body'),
    ]
}

module.exports = authValidation;