/**
 * Importa "Lista de precios.xlsx" del directorio raíz del proyecto y reemplaza
 * el catálogo de productos en la base de datos.
 *
 * Uso (desde el directorio backend/):
 *   node --env-file=.env ./scripts/seed-catalogo.mjs
 *
 * Columnas del Excel:
 *   A (índice 0) → código
 *   B (índice 1) → descripción / artículo
 *   D (índice 3) → precio final (con IVA)
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

async function parseCatalog(xlsxPath) {
  const buf = await readFile(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colA = String(row[0] ?? '').trim();   // código
    const colB = String(row[1] ?? '').trim();   // descripción
    const rawD = row[3];                        // precio final (col D)

    const precio =
      typeof rawD === 'number'
        ? rawD
        : parseFloat(String(rawD ?? '').replace(',', '.'));

    if (!Number.isFinite(precio) || precio <= 0) continue;

    const descripcion = colB || colA;
    if (!descripcion) continue;

    out.push({
      codigo: colA || `row-${out.length + 1}`,
      descripcion,
      precioUnitario: precio,
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
