// The Priority API is not connected yet. Every Priority source below reports connected: false, and every pull that
// reads one stops before reading or writing anything, returning ok: false with this reason.
export const PRIORITY_NOT_CONNECTED = 'Priority sync not connected yet';
