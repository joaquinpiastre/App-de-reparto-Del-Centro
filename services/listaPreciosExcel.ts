import * as XLSX from 'xlsx';

import type { ProductoLista } from '@/types';

function normHeader(k: string): string {
  return String(k)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_');
}

function pickCodigo(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const nk = normHeader(k);
    if (nk.includes('codigo') || nk === 'code' || nk === 'sku' || nk === 'id') {
      const v = row[k];
      if (v !== undefined && v !== '') return String(v).trim();
    }
  }
  const first = keys[0];
  return first ? String(row[first] ?? '').trim() : '';
}

function pickDescripcion(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const nk = normHeader(k);
    if (
      nk.includes('descripcion') ||
      nk.includes('producto') ||
      nk === 'desc' ||
      nk.includes('nombre')
    ) {
      const v = row[k];
      if (v !== undefined && v !== '') return String(v).trim();
    }
  }
  for (const k of keys) {
    const nk = normHeader(k);
    if (!nk.includes('precio') && !nk.includes('precio_unit')) {
      const v = row[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
}

function pickPrecio(row: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const nk = normHeader(k);
    if (nk.includes('precio') || nk.includes('importe') || nk === 'pvp' || nk === 'unit') {
      const v = row[k];
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/**
 * Lee el primer libro de un .xlsx/.xls desde una URI local (DocumentPicker / FileSystem).
 * Columnas típicas: código | descripción/producto | precio (nombres flexibles).
 */
export async function parseListaPreciosDesdeUri(uri: string): Promise<ProductoLista[]> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`No se pudo leer el archivo (${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const out: ProductoLista[] = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const descripcion = pickDescripcion(row, keys);
    const precioUnitario = pickPrecio(row, keys);
    if (!descripcion && precioUnitario <= 0) continue;
    const codigo = pickCodigo(row, keys) || `row-${out.length + 1}`;
    out.push({
      codigo,
      descripcion: descripcion || codigo,
      precioUnitario,
    });
  }
  return out;
}
