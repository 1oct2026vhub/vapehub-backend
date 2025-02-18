'use strict';
const { Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { trendingProduct } = require('../components/product/domain/product.controller');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by' });
            this.hasMany(models.UserAddress, { foreignKey: 'user_id', as: "UserAddresses" });
            this.hasMany(models.Product, { foreignKey: 'updated_by' });
            this.hasMany(models.Cart, { foreignKey: 'user_id' });
            this.belongsTo(models.Role, { foreignKey: "roleId", as: "roles" });
            this.hasMany(models.Order, { foreignKey: "user_id", as: "orders" });
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
            type: DataTypes.STRING,
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
        },
        blocked: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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

    User.beforeCreate(async (user, options) => {
        if (user.password) {
            user.password = await bcrypt.hash(user.password, 10); // Hash password before saving
        }
    });
    User.afterCreate(async (user, options) => {
        if (!user.referral_code) {
            user.referral_code = User.generateReferralCode(user.id);
        }
        await user.save();
    });

    return User;
};