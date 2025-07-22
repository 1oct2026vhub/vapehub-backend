const { Connect } = require('../../../../models');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');

module.exports.createConnect = async (req, res) => {
  try {
    const { send_us_a_message, call_us, social_media, facebook, whatsapp, instagram, email, phone_number } = req.body;
    const connect = await Connect.create({ send_us_a_message, call_us, social_media, facebook, whatsapp, instagram, email, phone_number });
    return successResponse(res, connect, 'Connect info created successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

module.exports.getAllConnects = async (req, res) => {
  try {
    const connects = await Connect.findAll();
    return successResponse(res, connects, 'All connect info retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

module.exports.getConnectById = async (req, res) => {
  try {
    const { id } = req.params;
    const connect = await Connect.findByPk(id);
    if (!connect) return errorResponse(res, {}, 'Connect info not found', 404);
    return successResponse(res, connect, 'Connect info retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

module.exports.updateConnect = async (req, res) => {
  try {
    const { id } = req.params;
    const { send_us_a_message, call_us, social_media, facebook, whatsapp, instagram, email, phone_number } = req.body;
    const connect = await Connect.findByPk(id);
    if (!connect) return errorResponse(res, {}, 'Connect info not found', 404);
    await connect.update({ send_us_a_message, call_us, social_media, facebook, whatsapp, instagram, email, phone_number });
    return successResponse(res, connect, 'Connect info updated successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
};

module.exports.deleteConnect = async (req, res) => {
  try {
    const { id } = req.params;
    const connect = await Connect.findByPk(id);
    if (!connect) return errorResponse(res, {}, 'Connect info not found', 404);
    await connect.destroy();
    return successResponse(res, {}, 'Connect info deleted successfully');
  } catch (error) {
    return errorResponse(res, error, error.message);
  }
}; 