import * as XLSX from 'xlsx';

import type { ProductoLista } from '@/types';

// Normaliza el texto de un encabezado para comparación: minúsculas sin tildes ni espacios.
function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

// Devuelve el índice de columna para cada campo buscando en los encabezados de la primera fila.
// Si no encuentra por nombre, usa los índices por defecto del Excel de Del Centro:
//   A(0)=Código  B(1)=Artículo  C(2)=P.Venta sin IVA  D(3)=Precio Final
function detectarColumnas(headerRow: unknown[]): { idxCodigo: number; idxDesc: number; idxPrecio: number } {
  let idxCodigo = 0;
  let idxDesc = 1;
  let idxPrecio = 3;

  const codigoKeys = ['codigo', 'code', 'sku', 'id', 'articulo', 'art'];
  const descKeys = ['descripcion', 'descripcion', 'articulo', 'art', 'producto', 'nombre', 'detalle', 'desc'];
  const precioKeys = ['preciofinal', 'preciociva', 'precioiva', 'preciouniario', 'precio', 'importe', 'pvp', 'total'];

  for (let i = 0; i < headerRow.length; i++) {
    const norm = normHeader(String(headerRow[i] ?? ''));
    if (!norm) continue;

    // Precio Final tiene prioridad sobre "precio" genérico
    if (precioKeys.some((k) => norm === k || norm.startsWith(k))) {
      if (idxPrecio === 3 || norm.includes('final') || norm.includes('iva')) {
        idxPrecio = i;
      }
    }
  }

  // Buscar código (primera columna que parezca código)
  for (let i = 0; i < headerRow.length; i++) {
    const norm = normHeader(String(headerRow[i] ?? ''));
    if (codigoKeys.includes(norm) || norm === 'codigo' || norm.startsWith('cod')) {
      idxCodigo = i;
      break;
    }
  }

  // Buscar descripción: "articulo", "descripcion", "producto", etc.
  // La columna de código ya fue tomada, la de descripción debe ser distinta.
  const descNorms = ['articulo', 'art', 'descripcion', 'producto', 'nombre', 'detalle', 'desc'];
  for (let i = 0; i < headerRow.length; i++) {
    if (i === idxCodigo || i === idxPrecio) continue;
    const norm = normHeader(String(headerRow[i] ?? ''));
    if (descNorms.some((k) => norm === k || norm.startsWith(k))) {
      idxDesc = i;
      break;
    }
  }

  return { idxCodigo, idxDesc, idxPrecio };
}

/**
 * Lee el primer libro de un .xlsx/.xls desde una URI local (DocumentPicker / FileSystem).
 * Detecta automáticamente las columnas por encabezado. Para el Excel de Del Centro:
 *   A = Código, B = Artículo (descripción), C = P. Venta sin IVA, D = Precio Final.
 * Si los encabezados no matchean, usa esas posiciones por defecto.
 */
export async function parseListaPreciosDesdeUri(uri: string): Promise<ProductoLista[]> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`No se pudo leer el archivo (${response.status}).`);
  }
  const arrayBuf = await response.arrayBuffer();
  // XLSX.read espera Uint8Array, no ArrayBuffer directamente
  const wb = XLSX.read(new Uint8Array(arrayBuf), { type: 'array' });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const sheet = wb.Sheets[name];

  // header: 1 → cada fila es un array de valores en orden de columna
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const { idxCodigo, idxDesc, idxPrecio } = detectarColumnas(headerRow);

  const out: ProductoLista[] = [];
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!Array.isArray(row)) continue;

    const colCodigo = String(row[idxCodigo] ?? '').trim();
    const colDesc   = String(row[idxDesc]   ?? '').trim();
    const rawPrecio = row[idxPrecio];

    const precioUnitario =
      typeof rawPrecio === 'number'
        ? rawPrecio
        : parseFloat(String(rawPrecio ?? '').replace(',', '.'));

    // Fila inválida: precio no numérico (encabezado u otra fila de texto)
    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) continue;

    // La descripción debe ser texto (no puede ser solo dígitos o estar vacía)
    const descripcion = colDesc || colCodigo;
    if (!descripcion) continue;

    out.push({
      codigo: colCodigo || `row-${out.length + 1}`,
      descripcion,
      precioUnitario: Math.round(precioUnitario * 100) / 100,
    });
  }
  return out;
}
