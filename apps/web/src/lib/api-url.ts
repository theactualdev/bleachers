const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Absolute base URL of the API. Tolerant of env values missing a scheme
 * (a bare host would otherwise be fetched as a relative path) and of
 * trailing slashes. Shared by the browser api client and server components.
 */
export const API_URL = (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '');
