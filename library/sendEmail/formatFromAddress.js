/**
 * Ensures a friendly From display name for clients that otherwise show only the address.
 * If `from` is already `Name <addr>` (contains < and >), it is returned unchanged.
 * Bare addresses get `EMAIL_SENDER_DISPLAY_NAME` (default Vapehub) as the display name.
 */
function formatFromWithDisplayName(from) {
    if (from == null || from === '') return from;
    const s = String(from).trim();
    if (!s) return from;
    if (s.includes('<') && s.includes('>')) return s;
    const display = (process.env.EMAIL_SENDER_DISPLAY_NAME || 'Vapehub').trim() || 'Vapehub';
    if (/^[^<\s]+@[^>\s]+$/.test(s)) {
        return `${display} <${s}>`;
    }
    return s;
}

module.exports = { formatFromWithDisplayName };
