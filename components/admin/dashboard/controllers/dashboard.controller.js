const dashboardDomain = require('../domain/dashboard.domain');
const dashboardHelper = require('../helper/dashboard.helper');

const getDashboardStats = async (req, res) => {
    try {
        const stats = await dashboardDomain.getDashboardStats();
        
        // Format the response data
        const formattedStats = {
            ...stats,
            sales: {
                today: dashboardHelper.formatCurrency(stats.sales.today),
                weekly: dashboardHelper.formatCurrency(stats.sales.weekly),
                monthly: dashboardHelper.formatCurrency(stats.sales.monthly)
            }
        };

        res.json({
            success: true,
            data: formattedStats,
            message: 'Dashboard statistics retrieved successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching dashboard statistics",
            error: error.message
        });
    }
};

module.exports = {
    getDashboardStats
}; 