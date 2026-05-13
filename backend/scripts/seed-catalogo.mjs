/**
 * Importa "Lista de precios.xlsx" del directorio raíz del proyecto y reemplaza
 * el catálogo de productos en la base de datos.
 *
 * Uso (desde el directorio backend/):
 *   node --env-file=.env ./scripts/seed-catalogo.mjs
 *
 * Detecta columnas por encabezado. Para el Excel de Del Centro:
 *   A = Código, B = Artículo (descripción), C = P. Venta sin IVA, D = Precio Final
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFile } from 'fs/promises';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// xlsx está en el node_modules raíz del proyecto (../../ desde backend/scripts/)
const XLSX = require(resolve(__dirname, '../../node_modules/xlsx/xlsx.js'));

const { Client } = pg;

function normHeader(s) {
  return String(s).trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
}

function detectarColumnas(headerRow) {
  let idxCodigo = 0, idxDesc = 1, idxPrecio = 3;
  const precioKeys = ['preciofinal', 'preciociva', 'precioiva', 'precio', 'importe', 'pvp', 'total'];
  const descNorms = ['articulo', 'art', 'descripcion', 'producto', 'nombre', 'detalle', 'desc'];

  for (let i = 0; i < headerRow.length; i++) {
    const norm = normHeader(String(headerRow[i] ?? ''));
    if (precioKeys.some(k => norm === k || norm.startsWith(k))) {
      if (idxPrecio === 3 || norm.includes('final') || norm.includes('iva')) idxPrecio = i;
    }
  }
  for (let i = 0; i < headerRow.length; i++) {
    const norm = normHeader(String(headerRow[i] ?? ''));
    if (norm === 'codigo' || norm.startsWith('cod')) { idxCodigo = i; break; }
  }
  for (let i = 0; i < headerRow.length; i++) {
    if (i === idxCodigo || i === idxPrecio) continue;
    const norm = normHeader(String(headerRow[i] ?? ''));
    if (descNorms.some(k => norm === k || norm.startsWith(k))) { idxDesc = i; break; }
  }
  return { idxCodigo, idxDesc, idxPrecio };
}

async function parseCatalog(xlsxPath) {
  const buf = await readFile(xlsxPath);
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const { idxCodigo, idxDesc, idxPrecio } = detectarColumnas(headerRow);
  console.log(`  Columnas detectadas: código=[${headerRow[idxCodigo]}] desc=[${headerRow[idxDesc]}] precio=[${headerRow[idxPrecio]}]`);

  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colCodigo = String(row[idxCodigo] ?? '').trim();
    const colDesc   = String(row[idxDesc]   ?? '').trim();
    const rawPrecio = row[idxPrecio];

    const precio =
      typeof rawPrecio === 'number'
        ? rawPrecio
        : parseFloat(String(rawPrecio ?? '').replace(',', '.'));

    if (!Number.isFinite(precio) || precio <= 0) continue;

    const descripcion = colDesc || colCodigo;
    if (!descripcion) continue;

    out.push({
      codigo: colCodigo || `row-${out.length + 1}`,
      descripcion,
      precioUnitario: Math.round(precio * 100) / 100,
    });
  }
  return out;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL en .env');

  const xlsxPath = resolve(__dirname, '../../Lista de precios.xlsx');
  console.log(`Leyendo: ${xlsxPath}`);

  const productos = await parseCatalog(xlsxPath);
  if (productos.length === 0) throw new Error('No se encontraron productos válidos en el Excel.');
  console.log(`Productos parseados: ${productos.length}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Asegurar que la tabla existe
    await client.query(`
      create table if not exists catalogo_productos (
        codigo text primary key,
        descripcion text not null,
        precio_unitario numeric(12,2) not null,
        activo boolean not null default true,
        updated_at timestamptz not null default now()
      )
    `);
    await client.query(`
      create table if not exists catalogo_productos_meta (
        id int primary key default 1,
        nombre_archivo text,
        updated_at timestamptz not null default now()
      )
    `);

    await client.query('begin');

    // Marcar todos como inactivos antes del reemplazo
    await client.query(`update catalogo_productos set activo = false`);

    let insertados = 0;
    for (const p of productos) {
      await client.query(
        `insert into catalogo_productos (codigo, descripcion, precio_unitario, activo, updated_at)
         values ($1, $2, $3, true, now())
         on conflict (codigo) do update
           set descripcion    = excluded.descripcion,
               precio_unitario = excluded.precio_unitario,
               activo         = true,
               updated_at     = now()`,
        [p.codigo, p.descripcion, p.precioUnitario]
      );
      insertados++;
      if (insertados % 200 === 0) console.log(`  ${insertados}/${productos.length}...`);
    }

    await client.query(
      `insert into catalogo_productos_meta (id, nombre_archivo, updated_at)
       values (1, $1, now())
       on conflict (id) do update
         set nombre_archivo = excluded.nombre_archivo,
             updated_at     = now()`,
      ['Lista de precios.xlsx']
    );

    await client.query('commit');
    console.log(`Catalogo importado: ${insertados} productos.`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
