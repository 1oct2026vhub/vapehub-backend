const axios = require("axios");
const { UserAddress, OrderAddress } = require("../../../models");
// const OrderAddress = require("../../../models/OrderAddress");
// const redis = require("../../../config/redis");

const saveShippingAddress = async (user_id, addressData, transaction)=>{
    let shipping_address_id = addressData.shipping_address_id;
    if(shipping_address_id == undefined){
        shipping_address_id = 0;
    }
    const existingAddress = await UserAddress.findOne({
        where: {id:shipping_address_id}
    });

    let orderAddress;
    if (existingAddress) {
        // If existing address exists, use its data to create OrderAddress
        orderAddress = await OrderAddress.create({
            user_id,
            order_id: null,
            name: existingAddress.name,
            last_name: existingAddress.last_name,
            company_name: existingAddress.company_name,
            street: existingAddress.street,
            apartment: existingAddress.apartment,
            city: existingAddress.city,
            post_code: existingAddress.post_code,
            country: existingAddress.country,
            town: existingAddress.town,
            region: existingAddress.region,
            county: existingAddress.county,
            phone: existingAddress.phone
        }, { transaction });
    } else {
        // If no existing address, use the provided addressData
        orderAddress = await OrderAddress.create({
            user_id,
            order_id: null,
            ...addressData
        }, { transaction });
        await UserAddress.create({ 
            user_id, 
            ...addressData, 
            updated_by: user_id,
            order_address_id: orderAddress.id 
        }, { transaction });
    }
    return orderAddress;
    // return existingAddress || await UserAddress.create({ 
    //     user_id, 
    //     ...addressData, 
    //     updated_by: user_id,
    //     order_address_id: orderAddress.id 
    // }, { transaction });
}

const getVivaAccessToken = async (payMethod) => {
    try {
        const VIVA_API_BASE_1 = process.env.VIVA_API_BASE_1;
        const CLIENT_ID = process.env.VIVA_CLIENT_ID;
        const CLIENT_SECRET = process.env.VIVA_CLIENT_SECRET;

        // Validate required environment variables
        if (!VIVA_API_BASE_1 || !CLIENT_ID || !CLIENT_SECRET) {
            throw new Error("Missing required Viva Wallet configuration");
        }

        let cachedAccessToken = null;
        let tokenExpiration = 0;

        // Check if we have a valid cached token
        if (cachedAccessToken && Date.now() < tokenExpiration) {
            return cachedAccessToken;
        }

        const response = await axios.post(
            `${VIVA_API_BASE_1}/connect/token`,
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

        if (!response.data || !response.data.access_token) {
            throw new Error("Invalid response from Viva Wallet authentication");
        }

        const { access_token, expires_in } = response.data;
        tokenExpiration = Date.now() + expires_in * 1000;
        cachedAccessToken = access_token;

        return cachedAccessToken;
    } catch (error) {
        console.error("Error getting Viva Wallet access token:", error.response?.data || error.message);
        throw new Error("Failed to authenticate with Viva Wallet");
    }
};

const createVivaOrder = async (accessToken, amount) => {
    try {
        if (!accessToken) {
            throw new Error("Access token is required");
        }

        if (!amount || amount <= 0) {
            throw new Error("Invalid amount");
        }

        const VIVA_API_BASE_2 = process.env.VIVA_API_BASE_2;
        const response = await axios.post(`${VIVA_API_BASE_2}/checkout/v2/orders`,
            {
                amount: Math.round(amount * 100), // Convert to cents and ensure it's an integer
                customerTrns: "Order Payment",
                sourceCode: "2305"
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );

        if (!response.data || !response.data.orderCode) {
            throw new Error("Invalid response from Viva Wallet API");
        }

        return response.data.orderCode;
    } catch (error) {
        console.error("Error creating Viva Wallet order:", error.response?.data || error.message);
        throw error;
    }
}

// const getVivaAccessTokenByMerchantId = async (payMethod) => {
//     try {
//         const VIVA_API_BASE_1 = process.env.VIVA_API_BASE_1;
//         const CLIENT_ID = process.env.VIVA_CLIENT_ID;
//         const CLIENT_SECRET = process.env.VIVA_CLIENT_SECRET;
//         var merchantId = '82231a6f-a467-47a4-8674-6e43606f49ce';
//         var apiKey = ']kD;D=';

//         var credentials = Buffer.from(merchantId + ':' + apiKey).toString('base64');
//         // Validate required environment variables
//         if (!VIVA_API_BASE_1 || !CLIENT_ID || !CLIENT_SECRET) {
//             throw new Error("Missing required Viva Wallet configuration");
//         }

//         let cachedAccessToken = null;
//         let tokenExpiration = 0;

//         // Check if we have a valid cached token
//         if (cachedAccessToken && Date.now() < tokenExpiration) {
//             return cachedAccessToken;
//         }

//         const response = await axios.post(
//             `${VIVA_API_BASE_1}/connect/token`,
//             {headers: {
//                 "Authorization": "Basic " + credentials,
//               }}
//         );

//         if (!response.data || !response.data.access_token) {
//             throw new Error("Invalid response from Viva Wallet authentication");
//         }

//         const { access_token, expires_in } = response.data;
//         tokenExpiration = Date.now() + expires_in * 1000;
//         cachedAccessToken = access_token;

//         return cachedAccessToken;
//     } catch (error) {
//         console.error("Error getting Viva Wallet access token:", error.response?.data || error.message);
//         throw new Error("Failed to authenticate with Viva Wallet");
//     }
// };

// const createVivaOrderByMerchantId = async (accessToken, amount) => {
//     try {
//         if (!accessToken) {
//             throw new Error("Access token is required");
//         }

//         if (!amount || amount <= 0) {
//             throw new Error("Invalid amount");
//         }

//         const VIVA_API_BASE_2 = process.env.VIVA_API_BASE_2;
//         const response = await axios.post(`${VIVA_API_BASE_2}/checkout/v2/orders`,
//             {
//                 amount: Math.round(amount * 100), // Convert to cents and ensure it's an integer
//                 customerTrns: "Order Payment",
//                 sourceCode: "2305"
//             },
//             {
//                 headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                     "Content-Type": "application/json"
//                 }
//             }
//         );

//         if (!response.data || !response.data.orderCode) {
//             throw new Error("Invalid response from Viva Wallet API");
//         }

//         return response.data.orderCode;
//     } catch (error) {
//         console.error("Error creating Viva Wallet order:", error.response?.data || error.message);
//         throw error;
//     }
// }

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

module.exports = {saveShippingAddress, getVivaAccessToken, createVivaOrder} //getVivaAccessTokenByMerchantId, createVivaOrderByMerchantId