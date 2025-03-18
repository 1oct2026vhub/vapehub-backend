const axios = require("axios");
const { UserAddress } = require("../../../models");
// const redis = require("../../../config/redis");

const saveShippingAddress = async (user_id, addressData, transaction)=>{
    console.log("user_id", user_id, addressData)
    const existingAddress = await UserAddress.findOne({
        where: { 
            user_id, 
            name: addressData.name,
            last_name: addressData.last_name,
            street: addressData.street,
            town: addressData.town,
            post_code: addressData.post_code, 
        }
      });
      const address = await UserAddress.findAll()
    console.log("address>>>>", address)
    console.log("existingAddress>>>>", existingAddress)
      return existingAddress || await UserAddress.create({ user_id, ...addressData, updated_by: user_id }, { transaction });
}

const getVivaAccessToken = async (payMethod)=> {
        const VIVA_API_BASE = process.env.VIVA_API_BASE;
        const CLIENT_ID = process.env.VIVA_CLIENT_ID;
        const CLIENT_SECRET = process.env.VIVA_CLIENT_SECRET;
        const API_KEY = process.env.VIVA_API_KEY;
        let cachedAccessToken = null;
        let tokenExpiration = 0;
        // const cachedAccessToken = await redisClient.get("accessToken");
        if (cachedAccessToken && Date.now() < tokenExpiration) {
            return cachedAccessToken;
        }

        const response = await axios.post("https://accounts.vivapayments.com/connect/token", 
            new URLSearchParams({
                grant_type: "client_credentials"
            }), 
            {
                auth: {
                    username: CLIENT_ID,
                    password: CLIENT_SECRET
                },
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        // const response = await axios.post(
        // `${VIVA_API_BASE}/connect/token`,
        // "grant_type=client_credentials",
        // {
        // headers: { "Content-Type": "application/x-www-form-urlencoded" },
        // auth: { username: CLIENT_ID, password: CLIENT_SECRET },
        // }
        // );

        const {access_token, expires_in} = response.data.access_token;
        tokenExpiration = Date.now() + expires_in * 1000;
        // Store token in Redis with expiration time
        // await redisClient.setEx("accessToken", expires_in, access_token);
        cachedAccessToken = access_token;
    
    return cachedAccessToken;
}

const createVivaOrder = async (accessToken, amount) => {
    const response = await axios.post(
        "https://api.vivapayments.com/orders",
        {
            amount: amount * 100, // Amount in cents
            customerTrns: "Order Payment",
            sourceCode: "Default"
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data.orderCode;
}

const getVivaTransactionToken = async (accessToken, orderCode) => {
    const response = await axios.get(
        `https://api.vivapayments.com/nativecheckout/v2/transactions/${orderCode}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }
    );

    return response.data.transactionId;
}

module.exports = {saveShippingAddress, getVivaAccessToken, createVivaOrder, getVivaTransactionToken}