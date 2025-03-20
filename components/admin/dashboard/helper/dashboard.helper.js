class DashboardHelper {
    formatDate(date) {
        return new Date(date).toISOString().split('T')[0];
    }

    calculatePercentage(current, previous) {
        if (!previous) return 0;
        return ((current - previous) / previous) * 100;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    getDateRange(type) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        switch (type) {
            case 'today':
                return {
                    start: today,
                    end: new Date()
                };
            case 'week':
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                return {
                    start: startOfWeek,
                    end: new Date()
                };
            case 'month':
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                return {
                    start: startOfMonth,
                    end: new Date()
                };
            default:
                return {
                    start: today,
                    end: new Date()
                };
        }
    }
}

module.exports = new DashboardHelper(); 