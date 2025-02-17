const passport = require("passport");
const { errorResponse } = require("../../utils/responseUtils");
const { Role } = require("../../models"); // Ensure Role and User models exist

const authenticate = (adminValidation = false) => async (req, res, next) => {
  try {
    console.log("Authenticating checkbox");
    // Authenticate user using Passport
    passport.authenticate("user-local", { session: false }, async (err, user, info) => {
        if (err || !user) {
            return errorResponse(res, { message: "Unauthorized: Invalid or missing token" }, "Unauthorized", 401);
        }

        req.user = user; // Attach the authenticated user to request

        // If adminValidation is required, fetch role details
        if (adminValidation) {
            const role = await Role.findOne({
            where: { id: user.roleId }, // Fetch role using roleId from user object
                attributes: ["id", "role", "is_admin_panel"], // Fetch only required fields
            });

            if (!role || !role.is_admin_panel) {
            return errorResponse(res, { message: "Unauthorized: User doesn't have permission" }, "Unauthorized", 403);
            }
        }

      next();
    })(req, res, next); // Proper execution of Passport
  } catch (error) {
    next(error);
  }
};

module.exports = authenticate;
