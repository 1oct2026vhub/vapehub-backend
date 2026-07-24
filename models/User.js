'use strict';
const { Model } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by' });
            this.hasMany(models.UserAddress, { foreignKey: 'user_id', as: "UserAddresses" });
            this.hasMany(models.Product, { foreignKey: 'updated_by' });
            this.hasMany(models.Cart, { foreignKey: 'user_id' });
            this.belongsTo(models.Role, { foreignKey: "roleId", as: "roles" });
            this.hasMany(models.Order, { foreignKey: "user_id", as: "orders" });
            
            // Referral relations
            this.hasMany(models.Referral, { 
                foreignKey: 'referrer_id', 
                as: 'referralsMade' 
            });
            this.hasOne(models.Referral, { 
                foreignKey: 'referred_user_id', 
                as: 'referralReceived' 
            });
            this.belongsTo(models.User, { 
                foreignKey: 'referred_by', 
                as: 'referrer' 
            });
            this.hasMany(models.LoyaltyPointsHistory, { 
                foreignKey: 'user_id', 
                as: 'loyaltyPointsHistory' 
            });
            // this.hasMany(models.Review, { foreignKey: 'user_id' });
            // this.hasMany(models.Referral, { foreignKey: 'referrer_id', as: 'referrals' });
            // this.hasMany(models.Blog, { foreignKey: 'author_id', as: 'blogs' });
            // this.hasMany(models.Transaction, { foreignKey: 'user_id' });
            // this.hasMany(models.Order, { foreignKey: 'user_id' });
        }

        // Method to verify password
        static async verifyPassword(storedPassword, providedPassword) {
            return bcrypt.compare(providedPassword, storedPassword);
        }

        // generate referal code
        static generateReferralCode(userId) {
            const code = `${userId}:${Math.random().toString(36).substring(2, 8).toLowerCase()}`;
            return code;
        }

    }

    User.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        first_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        last_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        email_verified_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        profile_pic_url: {
            type: DataTypes.STRING,
            allowNull: true
        },
        blog_author_role: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        blog_author_bio: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        blog_author_slug: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        blog_author_archive_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        blog_author_team_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        gender: {
            type: DataTypes.STRING,
            allowNull: true
        },
        dob: {
            type: DataTypes.DATE,
            allowNull: true
        },
        token: {
            type: DataTypes.STRING,
            allowNull: true
        },
        token_expiry: {
            type: DataTypes.DATE,
            allowNull: true
        },
        remember_token: {
            type: DataTypes.STRING,
            allowNull: true
        },
        int_field: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
            model: "roles",
            key: "id",
            },
        },
        referral_code: {
            type: DataTypes.STRING(15),
            allowNull: true,
            unique: true
        },
        referred_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        referral_points: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        loyalty_points: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Total loyalty points earned by the user'
        },
        receive_promotions: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        blocked: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        super_user: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        is_temporary: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Flag to identify temporary guest users'
        },
    }, {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        paranoid: true,
        timestamps: true
    });

    // Add a method to verify password in instance methods
    User.prototype.verifyPassword = function (providedPassword) {
        return bcrypt.compareSync(providedPassword, this.password);
    };

    // Add method to generate referral code
    User.prototype.generateReferralCode = async function(options = {}) {
        if (!this.id) {
            throw new Error('User ID is required to generate referral code');
        }

        let isUnique = false;
        let referralCode;
        let attempts = 0;
        const maxAttempts = 10; // Prevent infinite loop
        
        while (!isUnique && attempts < maxAttempts) {
            attempts++;
            // Generate a random string of 6 characters
            const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
            // Combine user ID with random string
            referralCode = `${this.id}${randomString}`;
            
            // Check if the code already exists
            const existingUser = await User.findOne({
                where: { referral_code: referralCode },
                transaction: options.transaction
            });
            
            if (!existingUser) {
                isUnique = true;
            }
        }
        
        if (!isUnique) {
            throw new Error(`Failed to generate unique referral code after ${maxAttempts} attempts for user ${this.id}`);
        }
        
        return referralCode;
    };

    // Add method to add referral points
    User.prototype.addReferralPoints = async function(points) {
        this.referral_points += points;
        await this.save();
    };

    User.beforeCreate(async (user, options) => {
        if (user.password) {
            user.password = await bcrypt.hash(user.password, 10);
        }
    });

    // Add afterCreate hook to generate referral code
    User.afterCreate(async (user, options) => {
        try {
            // Generate referral code with transaction support
            const referralCode = await user.generateReferralCode(options);
            
            // Update user with referral code, preserving transaction context
            await user.update(
                { referral_code: referralCode },
                { transaction: options.transaction }
            );
        } catch (error) {
            console.error(`Error generating referral code for user ID ${user?.id}:`, error);
            // Log error but don't throw - user creation should still succeed
            // The referral code can be generated later if needed
        }
    });

    return User;
};