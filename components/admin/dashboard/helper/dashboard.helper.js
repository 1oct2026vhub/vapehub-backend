const { getTodayStart, getTodayEnd, getWeekStart, getMonthStart, getYearStart, formatDateTime } = require("../../../../utils/dateUtils");

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