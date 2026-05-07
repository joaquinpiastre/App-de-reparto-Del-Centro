import * as XLSX from 'xlsx';

import type { ProductoLista } from '@/types';

/**
 * Lee el primer libro de un .xlsx/.xls desde una URI local (DocumentPicker / FileSystem).
 * Columnas fijas: A = código, B = descripción, D = precio unitario.
 * Las filas donde la columna D no es un número válido se ignoran (ej. encabezados).
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

  // header: 1 → cada fila es un array; las columnas quedan en índice 0-based:
  // índice 0 = col A, 1 = col B, 2 = col C, 3 = col D
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  const out: ProductoLista[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colA = String(row[0] ?? '').trim();   // código
    const colB = String(row[1] ?? '').trim();   // descripción
    const rawD = row[3];                        // precio (col D)

    const precioUnitario =
      typeof rawD === 'number'
        ? rawD
        : parseFloat(String(rawD ?? '').replace(',', '.'));

    // Fila inválida: precio no es número (encabezado u otra fila de texto)
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) continue;

    const descripcion = colB || colA;
    if (!descripcion) continue;

    out.push({
      codigo: colA || `row-${out.length + 1}`,
      descripcion,
      precioUnitario,
    });
  }
  return out;
}
