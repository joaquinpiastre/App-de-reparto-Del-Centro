import type { RolUsuario, Usuario } from '@/types';
import { API_ENABLED } from '@/constants/api';
import { apiRequest, getAuthToken, setAuthToken } from './apiClient';

interface LoginResponse {
  token: string;
  usuario: Usuario;
}

interface JwtPayload {
  sub: string;
  nombre: string;
  rol: RolUsuario;
  exp: number;
}

function leerPayloadJwt(token: string): JwtPayload | null {
  try {
    const parte = token.split('.')[1];
    if (!parte) return null;
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)) as JwtPayload;
  } catch {
    return null;
  }
}

export async function loginApi(usuario: string, pin: string): Promise<Usuario | null> {
  if (!API_ENABLED) return null;
  const data = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, pin }),
    omitAuth: true,
  });
  await setAuthToken(data.token);
  return data.usuario;
}

export async function restaurarSesionApi(): Promise<Usuario | null> {
  if (!API_ENABLED) return null;
  const token = await getAuthToken();
  if (!token) return null;

  const payload = leerPayloadJwt(token);

  // Token malformado o expirado → limpiar y forzar login
  if (!payload || Date.now() / 1000 > payload.exp) {
    await setAuthToken(null);
    return null;
  }

  // Token válido: reconstruir usuario desde el payload sin llamada de red.
  // Esto evita que un error de conectividad al desbloquear el celular
  // borre el token y cierre la sesión prematuramente.
  return {
    id: payload.sub,
    nombre: payload.nombre,
    rol: payload.rol,
    activo: true,
  };
}
