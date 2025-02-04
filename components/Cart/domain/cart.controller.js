const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Cart, Product, Flavor, Category, Brand, ProductImage, ProductFlavor } = require("../../../models");

const includeClause = [
    {
        model: Product,
        include: [
            { model: Category, as: 'Category' },
            { model: Brand, as: 'Brand' },
            { model: ProductImage, as: 'ProductImages' },
        ]
    },
    { model: Flavor, as: 'Flavor' }
]

module.exports.listCartItems = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const carts = await Cart.findAll({
            where: { user_id },
            include: includeClause
        });
        if (!carts?.[0]) {
            throw {
                message: "Cart is empty"
            }
        }
        successResponse(res, carts, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getCartByid = async (req, res, next) => {
    try {
        const cart = await Cart.findByPk(req.params.id,
            {
                include: includeClause
            });
        if (!cart) {
            throw {
                message: "Cart not found",
                statusCode: 400,
            };
        }
        successResponse(res, cart, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createCart = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const { product_id, flavor_id, quantity } = req.body;

        // Check if the cart item already exists for the user with the specified product and flavor
        const cartExists = await Cart.findOne({
            where: { user_id, product_id, flavor_id },
            include: includeClause
        });

        // Fetch the product along with its associated flavors
        const product = await Product.findOne({
            where: { id: product_id }
        });
        const productFlavors = await ProductFlavor.findOne({
            where: { product_id, flavor_id }
        })

        if (!product) {
            throw {
                message: "Product not found",
                statusCode: 400,
            };
        }
        if (!productFlavors && flavor_id) {
            throw {
                message: "Flavor not found for the specified product",
                statusCode: 400,
            };
        }

        // Determine the available stock
        let availableStock = product?.stock_quantity || 0;

        // If the product has a flavor variant, get its stock quantity
        if (productFlavors?.stock_quantity) {
            availableStock = productFlavors?.stock_quantity || 0;
        }

        // If no stock is available, return an error
        if (availableStock === 0) {
            return errorResponse(res, {}, "Out of stock", 400);
        }

        // Ensure requested quantity does not exceed available stock
        if (quantity > availableStock) {
            return errorResponse(res, {}, `Only ${availableStock} item(s) available in stock`, 400);
        }

        if (cartExists) {
            // If the cart item exists, update the quantity
            cartExists.quantity = quantity;
            await cartExists.save();
            return successResponse(res, cartExists, 'Cart updated successfully');
        } else {
            // If the cart item doesn't exist, create a new cart item and return with associated product and flavor
            const newItem = await Cart.create({ user_id, product_id, flavor_id, quantity });
            const cartItem = await Cart.findOne({
                where: { id: newItem.id },
                include: includeClause,
            });
            return successResponse(res, cartItem, 'Cart created successfully');
        }
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateCart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        const cartItem = await Cart.findByPk(id, { include: includeClause });
        if (!cartItem) {
            throw {
                statusCode: 404,
                message: 'Cart item not found'
            }
        }

        cartItem.quantity = quantity || cartItem.quantity;
        await cartItem.save();

        successResponse(res, cartItem, 'Cart updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteCart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const cart = await Cart.findByPk(id);
        if (!cart) {
            throw {
                statusCode: 404,
                message: 'Cart item not found'
            }
        }
        await cart.destroy({ force: true });
        successResponse(res, { message: 'Cart deleted successfully' });
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}