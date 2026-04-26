const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = rawApiUrl ? rawApiUrl.replace(/\/$/, '') : '';
export const API_ENABLED = API_URL.length > 0;

export const MOBILE_API_KEY = process.env.EXPO_PUBLIC_API_KEY_MOBILE?.trim() ?? '';
