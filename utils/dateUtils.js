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
  getDashboardDateRanges
}; 