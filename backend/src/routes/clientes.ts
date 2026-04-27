import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

const crearClienteSchema = z.object({
  nombre: z.string().trim().min(2),
  direccion: z.string().trim().min(4),
  telefono: z.string().trim().min(6),
  pedido: z.string().trim().min(2),
});

async function ensureClientesTable(): Promise<void> {
  await pool.query(
    `create table if not exists clientes (
      id text primary key,
      nombre text not null,
      direccion text not null,
      telefono text not null,
      pedido text not null,
      activo boolean not null default true,
      created_at timestamptz not null default now()
    )`
  );
}

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden administrar clientes.' });
    return false;
  }
  return true;
}

export const clientesRouter = Router();

clientesRouter.get('/clientes', requireAuth, async (_req, res) => {
  await ensureClientesTable();
  const { rows } = await pool.query(
    `select id, nombre, direccion, telefono, pedido
     from clientes
     where activo = true
     order by created_at desc`
  );
  res.json({ clientes: rows });
});

clientesRouter.post('/clientes', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  const parsed = crearClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  await ensureClientesTable();
  const p = parsed.data;
  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `insert into clientes (id, nombre, direccion, telefono, pedido, activo)
     values ($1, $2, $3, $4, $5, true)`,
    [id, p.nombre, p.direccion, p.telefono, p.pedido]
  );
  res.json({ ok: true, cliente: { id, ...p } });
});
