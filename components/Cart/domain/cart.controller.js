const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Cart, Product, Flavor } = require("../../../models");

module.exports.listCartItems = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const carts = await Cart.findAll({
            where: { user_id },
            include: [
                { model: Product, attributes: ['name', 'slug', 'price', 'discount_price'] },
                { model: Flavor, attributes: ['name', 'id'] }
            ]
        });
        successResponse(res, carts, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getCartByid = async (req, res, next) => {
    try {
        const cart = await Cart.findByPk(req.params.id,
            {
                include: [
                    { model: Product, attributes: ['name', 'slug', 'price', 'discount_price'] },
                    { model: Flavor, attributes: ['name', 'id'] }
                ]
            });
        successResponse(res, cart, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createCart = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const { product_id, flavor_id, quantity, price, discount_price } = req.body;
        const cartItem = await Cart.create({
            user_id,
            product_id,
            flavor_id,
            quantity,
            price,
            discount_price
        });
        successResponse(res, cartItem, 'Cart created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateCart = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity, price, discount_price } = req.body;
        const cartItem = await Cart.findByPk(id);
        if (!cartItem) {
            return res.status(404).json({ error: 'Cart item not found' });
        }

        cartItem.quantity = quantity || cartItem.quantity;
        cartItem.price = price || cartItem.price;
        cartItem.discount_price = discount_price || cartItem.discount_price;

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
        successResponse(res, { message: 'Cart deleted successfully' }, null, 204);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}