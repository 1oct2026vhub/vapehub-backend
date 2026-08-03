const serializeErrorForLog = (error) => ({
    name: error?.name || null,
    message: error?.message || null,
    stack: error?.stack || null,
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    axios: error?.isAxiosError
        ? {
            method: error?.config?.method || null,
            url: error?.config?.url || null,
            timeout: error?.config?.timeout || null,
            response_status: error?.response?.status || null,
            response_data: error?.response?.data || null,
        }
        : null,
});

module.exports = { serializeErrorForLog };
