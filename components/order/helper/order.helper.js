const axios = require("axios");
const { UserAddress } = require("../../../models");
// const redis = require("../../../config/redis");

const saveShippingAddress = async (user_id, addressData, transaction)=>{
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
    //   const address = await UserAddress.findAll()
      return existingAddress || await UserAddress.create({ user_id, ...addressData, updated_by: user_id }, { transaction });
}

const getVivaAccessToken = async (payMethod)=> {
    try{
        const VIVA_API_BASE_1 = process.env.VIVA_API_BASE_1;
        const CLIENT_ID = process.env.VIVA_CLIENT_ID;
        const CLIENT_SECRET = process.env.VIVA_CLIENT_SECRET;
        // const API_KEY = process.env.VIVA_API_KEY;
        let cachedAccessToken = null;
        let tokenExpiration = 0;
        // const cachedAccessToken = await redisClient.get("accessToken");
        if (cachedAccessToken && Date.now() < tokenExpiration) {
            return cachedAccessToken;
        }
        const response = await axios.post(`${VIVA_API_BASE_1}/connect/token`, 
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

        const {access_token, expires_in} = response.data;
        tokenExpiration = Date.now() + expires_in * 1000;
        cachedAccessToken = access_token;
    
        return cachedAccessToken;
    }
    catch(error){
        console.log("error>>>>", error)
    }

}

const createVivaOrder = async (accessToken, amount) => {
    const VIVA_API_BASE_2 = process.env.VIVA_API_BASE_2;
    const response = await axios.post(`${VIVA_API_BASE_2}/checkout/v2/orders`,
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

// const getVivaTransactionToken = async (accessToken, orderCode) => {
//     const response = await axios.get(
//         `https://api.vivapayments.com/nativecheckout/v2/transactions/${orderCode}`,
//         {
//             headers: {
//                 Authorization: `Bearer ${accessToken}`
//             }
//         }
//     );

//     return response.data.transactionId;
// }

module.exports = {saveShippingAddress, getVivaAccessToken, createVivaOrder}