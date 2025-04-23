/**
 * Date and Time Utility Functions
 * 
 * This module provides utility functions for working with dates and times using Moment.js.
 * All functions return dates in 'YYYY-MM-DD HH:mm:ss' format for consistent backend filtering.
 */

const moment = require('moment');

/**
 * Get the start of the current day (00:00:00)
 * @returns {string} Formatted date string of the start of the current day
 */
const getTodayStart = () => {
  return moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Get the end of the current day (23:59:59)
 * @returns {string} Formatted date string of the end of the current day
 */
const getTodayEnd = () => {
  return moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Get the start of the current week (Monday at 00:00:00)
 * @returns {string} Formatted date string of the start of the current week
 */
const getWeekStart = () => {
  return moment().startOf('week').format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Get the start of the current month (1st day at 00:00:00)
 * @returns {string} Formatted date string of the start of the current month
 */
const getMonthStart = () => {
  return moment().startOf('month').format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Get the start of the current year (January 1st at 00:00:00)
 * @returns {string} Formatted date string of the start of the current year
 */
const getYearStart = () => {
  return moment().startOf('year').format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Get formatted date string in YYYY-MM-DD HH:mm:ss format
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string
 */
const formatDateTime = (date) => {
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
};

/**
 * Format large numbers into abbreviated readable strings
 * @param {number} num - The number to format
 * @param {number} [decimals=2] - Number of decimal places to show
 * @returns {string} Formatted number string
 * 
 * Examples:
 * - 999 → "999.00"
 * - 1,200 → "1.20K"
 * - 1,500,000 → "1.50M"
 * - 1,200,000,000 → "1.20B"
 * - 1,500,000,000,000 → "1.50T"
 */
const formatNumber = (num, decimals = 2) => {
  if (num === null || num === undefined) return '0.00';
  
  // Handle numbers less than 1000
  if (num < 1000) return num.toFixed(decimals);
  
  // Define abbreviations for different scales
  const abbreviations = [
    { value: 1e12, symbol: 'T' }, // Trillion
    { value: 1e9, symbol: 'B' },  // Billion
    { value: 1e6, symbol: 'M' },  // Million
    { value: 1e3, symbol: 'K' }   // Thousand
  ];
  
  // Find the appropriate abbreviation
  for (const { value, symbol } of abbreviations) {
    if (num >= value) {
      // Calculate the abbreviated value
      const abbreviatedValue = (num / value).toFixed(decimals);
      return abbreviatedValue + symbol;
    }
  }
  
  // Fallback (should never reach here)
  return num.toFixed(decimals);
};

/**
 * Get all date ranges for dashboard statistics
 * @returns {Object} Object containing all date ranges
 */
const getDashboardDateRanges = () => {
  return {
    todayStart: getTodayStart(),
    todayEnd: getTodayEnd(),
    weekStart: getWeekStart(),
    monthStart: getMonthStart(),
    yearStart: getYearStart()
  };
};

module.exports = {
  getTodayStart,
  getTodayEnd,
  getWeekStart,
  getMonthStart,
  getYearStart,
  formatDateTime,
  formatNumber,
  getDashboardDateRanges
}; 