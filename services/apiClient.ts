import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENABLED, API_URL } from '@/constants/api';

const TOKEN_KEY = 'auth_token';

export async function setAuthToken(token: string | null): Promise<void> {
  if (!token) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { omitAuth?: boolean }
): Promise<T> {
  if (!API_ENABLED) {
    throw new Error('API no configurada (falta EXPO_PUBLIC_API_URL).');
  }
  const token = init?.omitAuth ? null : await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const contentType = res.headers.get('content-type') ?? '';
  const json = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error: unknown }).error)
        : `Error HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}
