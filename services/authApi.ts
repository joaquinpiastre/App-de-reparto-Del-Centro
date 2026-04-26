import type { Usuario } from '@/types';
import { API_ENABLED } from '@/constants/api';
import { apiRequest, setAuthToken } from './apiClient';

interface LoginResponse {
  token: string;
  usuario: Usuario;
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
