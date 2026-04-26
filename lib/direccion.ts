/** Normaliza texto de calle para comparar "misma calle" (sin acentos, minúsculas). */
export function normalizarCalle(direccion: string): string {
  const base = direccion.split(/[,\n]/)[0]?.trim() ?? '';
  const sinNumero = base.replace(/\s+\d+.*$/i, '').trim();
  return sinNumero
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function direccionesMismaCalle(a: string, b: string): boolean {
  const ca = normalizarCalle(a);
  const cb = normalizarCalle(b);
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}
