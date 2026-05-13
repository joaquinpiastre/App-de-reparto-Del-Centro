import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

function parsePrecioInput(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  const raw = value.trim();
  if (!raw) return Number.NaN;
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

const productoSchema = z.object({
  codigo: z.string().trim().min(1),
  descripcion: z.string().trim().min(1),
  precioUnitario: z.preprocess((v) => parsePrecioInput(v), z.number().positive()),
});

const upsertCatalogoSchema = z.object({
  nombreArchivo: z.string().trim().min(1).optional(),
  productos: z.array(productoSchema).min(1),
});

async function ensureCatalogoTables(): Promise<void> {
  await pool.query(
    `create table if not exists catalogo_productos (
      codigo text primary key,
      descripcion text not null,
      precio_unitario numeric(12,2) not null,
      activo boolean not null default true,
      updated_at timestamptz not null default now()
    )`
  );
  await pool.query(
    `create table if not exists catalogo_productos_meta (
      id int primary key default 1,
      nombre_archivo text,
      updated_at timestamptz not null default now()
    )`
  );
}

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden actualizar el catálogo.' });
    return false;
  }
  return true;
}

export const catalogoProductosRouter = Router();

catalogoProductosRouter.get('/catalogo-productos', requireAuth, async (_req, res) => {
  await ensureCatalogoTables();
  const [metaRes, prodRes] = await Promise.all([
    pool.query(`select nombre_archivo, updated_at from catalogo_productos_meta where id = 1`),
    pool.query(
      `select codigo, descripcion, precio_unitario as "precioUnitario"
       from catalogo_productos
       where activo = true
       order by descripcion asc`
    ),
  ]);
  const meta = metaRes.rows[0] as { nombre_archivo?: string; updated_at?: string } | undefined;
  const productos = (prodRes.rows as { codigo: string; descripcion: string; precioUnitario: unknown }[]).map((p) => ({
    codigo: p.codigo,
    descripcion: p.descripcion,
    precioUnitario: Number(p.precioUnitario),
  }));
  res.json({
    catalogo: {
      nombreArchivo: meta?.nombre_archivo ?? null,
      updatedAt: meta?.updated_at ?? null,
      productos,
    },
  });
});

catalogoProductosRouter.post('/catalogo-productos/reemplazar', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  const parsed = upsertCatalogoSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.join('.') || 'productos';
    res.status(400).json({ error: `Payload inválido en ${where}: ${issue?.message ?? 'dato inválido'}.` });
    return;
  }
  await ensureCatalogoTables();
  const payload = parsed.data;
  await pool.query('begin');
  try {
    await pool.query(`update catalogo_productos set activo = false`);
    for (const p of payload.productos) {
      await pool.query(
        `insert into catalogo_productos (codigo, descripcion, precio_unitario, activo, updated_at)
         values ($1, $2, $3, true, now())
         on conflict (codigo) do update
           set descripcion = excluded.descripcion,
               precio_unitario = excluded.precio_unitario,
               activo = true,
               updated_at = now()`,
        [p.codigo, p.descripcion, p.precioUnitario]
      );
    }
    await pool.query(
      `insert into catalogo_productos_meta (id, nombre_archivo, updated_at)
       values (1, $1, now())
       on conflict (id) do update
         set nombre_archivo = excluded.nombre_archivo,
             updated_at = now()`,
      [payload.nombreArchivo ?? null]
    );
    await pool.query('commit');
    res.json({ ok: true, total: payload.productos.length });
  } catch (e) {
    await pool.query('rollback');
    throw e;
  }
});
