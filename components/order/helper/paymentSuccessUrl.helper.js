/**
 * Build frontend payment-success URL (same query shape as Worldpay resultURLs).
 * Example: https://vapehub-staging.devateam.com/payment-success/?orderCode=...&transactionId=...&amount=0.00&currency=GBP
 */
function buildPaymentSuccessRedirectUrl(orderCode, amount) {
  const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const ref = orderCode != null && String(orderCode).trim() !== '' ? String(orderCode) : '';
  if (!frontendBase || !ref) {
    return null;
  }

  const amountRaw = amount != null && amount !== '' ? parseFloat(amount) : 0;
  const amountQuery = (Number.isFinite(amountRaw) ? Math.max(0, amountRaw) : 0).toFixed(2);

  return `${frontendBase}/payment-success/?orderCode=${encodeURIComponent(
    ref
  )}&transactionId=${encodeURIComponent(ref)}&amount=${encodeURIComponent(
    amountQuery
  )}&currency=GBP`;
}

function generatePaymentReference() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = {
  buildPaymentSuccessRedirectUrl,
  generatePaymentReference,
};
