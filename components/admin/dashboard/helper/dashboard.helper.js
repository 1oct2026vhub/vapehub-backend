const { getTodayStart, getTodayEnd, getWeekStart, getMonthStart, getYearStart, formatDateTime, formatNumber } = require("../../../../utils/dateUtils");

class DashboardHelper {
    formatDate(date) {
        return new Date(date).toISOString().split('T')[0];
    }

    calculatePercentage(current, previous) {
        if (!previous) return 0;
        return ((current - previous) / previous) * 100;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP'
        }).format(amount);
    }

    /**
     * Format a number into an abbreviated readable string
     * @param {number} num - The number to format
     * @param {number} [decimals=2] - Number of decimal places to show
     * @returns {string} Formatted number string (e.g., 1.20K, 1.50M)
     */
    formatAbbreviatedNumber(num, decimals = 2) {
        return formatNumber(num, decimals);
    }

    getDateRange(type) {
        switch (type) {
            case 'today':
                return {
                    start: getTodayStart(),
                    end: getTodayEnd()
                };
            case 'week':
                return {
                    start: getWeekStart(),
                    end: getTodayEnd()
                };
            case 'month':
                return {
                    start: getMonthStart(),
                    end: getTodayEnd()
                };
            case 'year':
                return {
                    start: getYearStart(),
                    end: getTodayEnd()
                };
            default:
                return {
                    start: getTodayStart(),
                    end: getTodayEnd()
                };
        }
    }
}

module.exports = new DashboardHelper(); 