import Constants from 'expo-constants';
import { Platform } from 'react-native';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

function getHostFromExpo(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split(':')[0]?.trim();
  return host || null;
}

function resolveApiUrl(url?: string): string {
  if (!url) return '';
  const normalized = url.replace(/\/$/, '');
  if (Platform.OS === 'web') return normalized;
  if (!/^https?:\/\/localhost(?::\d+)?$/i.test(normalized)) return normalized;
  const host = getHostFromExpo();
  if (!host) return normalized;
  return normalized.replace('localhost', host);
}

export const API_URL = resolveApiUrl(rawApiUrl);
export const API_ENABLED = API_URL.length > 0;

export const MOBILE_API_KEY = process.env.EXPO_PUBLIC_API_KEY_MOBILE?.trim() ?? '';
