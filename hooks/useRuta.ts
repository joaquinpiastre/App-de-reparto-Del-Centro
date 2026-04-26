import type { Cliente } from '@/types';

export function optimizarRuta(clientes: Cliente[]) {
  return [...clientes].sort((a, b) => a.orden - b.orden);
}
