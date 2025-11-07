'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Menu extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                as: 'updatedBy',
                foreignKey: 'updated_by',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            this.belongsTo(models.Menu, {
                as: 'parent',
                foreignKey: 'menu_parent'
            });
            this.hasMany(models.Menu, {
                as: 'children',
                foreignKey: 'menu_parent'
            });
            // Dynamic associations based on entity_type
            this.belongsTo(models.Brand, {
                foreignKey: 'entity_id',
                constraints: false,
                scope: {
                    entity_type: 'brand'
                }
            });
            this.belongsTo(models.Category, {
                foreignKey: 'entity_id',
                constraints: false,
                scope: {
                    entity_type: 'category'
                }
            });
            this.belongsTo(models.Product, {
                foreignKey: 'entity_id',
                constraints: false,
                scope: {
                    entity_type: 'product'
                }
            });
            this.belongsTo(models.Blog, {
                foreignKey: 'entity_id',
                constraints: false,
                scope: {
                    entity_type: 'blog'
                }
            });
            this.belongsTo(models.Deal, {
                foreignKey: 'entity_id',
                constraints: false,
                scope: {
                    entity_type: 'deal'
                }
            });
        }

        // Instance method to get entity details
        async getEntityDetails() {
            if (!this.entity_type || !this.entity_id) return null;

            const models = this.sequelize.models;
            const EntityModel = models[this.entity_type.charAt(0).toUpperCase() + this.entity_type.slice(1)];
            
            if (!EntityModel) return null;

            return await EntityModel.findByPk(this.entity_id);
        }
    }

    Menu.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        label: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Label cannot be empty'
                }
            }
        },
        menu_parent: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'menus',
                key: 'id'
            }
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                isInt: {
                    msg: 'Order must be an integer'
                }
            }
        },
        original: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Original URL/slug cannot be empty'
                }
            }
        },
        entity_type: {
            type: DataTypes.ENUM('brand', 'category', 'product', 'blog', 'page', 'deal'),
            allowNull: true,
            validate: {
                isValidEntityType(value) {
                    if (value && !['brand', 'category', 'product', 'blog', 'page', 'deal'].includes(value)) {
                        throw new Error('Invalid entity type');
                    }
                }
            }
        },
        entity_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                async isValidEntity(value) {
                    if (this.entity_type && !value && this.entity_type !== 'page') {
                        throw new Error('Entity ID is required when entity type is specified');
                    }
                    if (value && this.entity_type) {
                        const models = this.sequelize.models;
                        const EntityModel = models[this.entity_type.charAt(0).toUpperCase() + this.entity_type.slice(1)];
                        if (!EntityModel) {
                            throw new Error('Invalid entity type');
                        }
                        const entity = await EntityModel.findByPk(value);
                        if (!entity) {
                            throw new Error(`${this.entity_type} with id ${value} not found`);
                        }
                    }
                }
            }
        },
        status: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        show_image: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        icon: {
            type: DataTypes.STRING,
            allowNull: true
        },
        image_url: {
            type: DataTypes.STRING,
            allowNull: true
        },
        hide_text: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        hide_mobile_view: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        hide_desktop_view: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        icon_position: {
            type: DataTypes.ENUM('left', 'right', 'top', 'bottom'),
            allowNull: false,
            defaultValue: 'left',
            validate: {
                isIn: {
                    args: [['left', 'right', 'top', 'bottom']],
                    msg: 'Invalid icon position'
                }
            }
        },
        list_on_active_product: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'Menu',
        tableName: 'menus',
        paranoid: true,
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['entity_type', 'entity_id'],
                name: 'menus_entity_type_entity_id_idx'
            },
            {
                fields: ['menu_parent', 'order'],
                name: 'menus_menu_parent_order_idx'
            },
            {
                fields: ['status'],
                name: 'menus_status_idx'
            },
            {
                fields: ['deleted_at'],
                name: 'menus_deleted_at_idx'
            }
        ],
        hooks: {
            beforeValidate: async (menu) => {
                // Set original URL if entity type and ID are provided
                if (menu.entity_type && menu.entity_id) {
                    const models = menu.sequelize.models;
                    const EntityModel = models[menu.entity_type.charAt(0).toUpperCase() + menu.entity_type.slice(1)];
                    if (EntityModel) {
                        const entity = await EntityModel.findByPk(menu.entity_id);
                        if (entity) {
                            // Use entity's slug if available, otherwise fallback to default format
                            menu.original = entity.slug ? `/${entity.slug}` : ``;
                        }
                    }
                }
            },
            beforeCreate: async (menu) => {
                // Set order if not provided
                if (!menu.order) {
                    const maxOrder = await Menu.findOne({
                        where: { menu_parent: menu.menu_parent || null },
                        order: [['order', 'DESC']]
                    });
                    menu.order = maxOrder ? maxOrder.order + 1 : 0;
                }
            }
        }
    });

    return Menu;
}; 