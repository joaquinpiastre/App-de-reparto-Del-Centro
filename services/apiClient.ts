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

const TIMEOUT_MS = 15_000;
// "Network request failed" es un fallo a nivel de conexión (TCP/DNS/TLS): el
// pedido nunca llegó al servidor, así que reintentarlo es seguro incluso para
// POST. Suele ser un corte momentáneo de red móvil — un par de reintentos con
// espera creciente resuelve la mayoría de estos casos sin que el usuario note nada.
const REINTENTOS_FALLO_RED = 2;
const ESPERA_ENTRE_REINTENTOS_MS = 1200;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esFalloDeRed(e: unknown): boolean {
  return e instanceof TypeError && /network request failed/i.test(e.message);
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

  let res: Response | undefined;
  for (let intento = 0; intento <= REINTENTOS_FALLO_RED; intento++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Sin respuesta del servidor (15s). Verificá tu conexión.');
      }
      if (esFalloDeRed(e)) {
        if (intento < REINTENTOS_FALLO_RED) {
          await esperar(ESPERA_ENTRE_REINTENTOS_MS * (intento + 1));
          continue;
        }
        throw new Error('No se pudo conectar con el servidor. Revisá tu conexión a internet e intentá de nuevo.');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
    break;
  }
  if (!res) {
    throw new Error('No se pudo conectar con el servidor. Revisá tu conexión a internet e intentá de nuevo.');
  }

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
