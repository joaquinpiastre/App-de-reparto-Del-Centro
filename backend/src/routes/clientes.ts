import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' } };

const categoriaSchema = z.array(z.enum(['A', 'B', 'C'])).optional().default([]);

const crearClienteSchema = z.object({
  nombre: z.string().trim().min(2),
  direccion: z.string().trim().min(4),
  telefono: z.string().trim().min(6),
  pedido: z.string().trim().min(2),
  tipo: z.enum(['cliente', 'taller']).optional().default('cliente'),
  categorias: categoriaSchema,
});

const editarClienteSchema = z.object({
  nombre: z.string().trim().min(2),
  direccion: z.string().trim().min(4),
  telefono: z.string().trim().min(6),
  pedido: z.string().trim().min(2),
  tipo: z.enum(['cliente', 'taller']).optional().default('cliente'),
  categorias: categoriaSchema,
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
  await pool.query(`alter table clientes add column if not exists tipo text not null default 'cliente'`);
  await pool.query(`update clientes set tipo = 'cliente' where tipo is null or trim(tipo) = ''`);
  await pool.query(`alter table clientes add column if not exists categorias text[] not null default '{}'`);
}

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo el administrador puede eliminar clientes del catálogo.' });
    return false;
  }
  return true;
}

function requireAltaEdicionClientes(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  const r = req.user?.rol;
  if (r !== 'admin' && r !== 'repartidor') {
    res.status(403).json({ error: 'Iniciá sesión como admin o repartidor para gestionar clientes.' });
    return false;
  }
  return true;
}

export const clientesRouter = Router();

clientesRouter.get('/clientes', requireAuth, async (_req, res) => {
  await ensureClientesTable();
  const { rows } = await pool.query(
    `select id, nombre, direccion, telefono, pedido, tipo, categorias
     from clientes
     where activo = true
     order by created_at desc`
  );
  res.json({ clientes: rows });
});

clientesRouter.post('/clientes', requireAuth, async (req, res) => {
  if (!requireAltaEdicionClientes(req as ReqWithUser, res)) return;
  const parsed = crearClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  await ensureClientesTable();
  const p = parsed.data;
  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.query(
    `insert into clientes (id, nombre, direccion, telefono, pedido, tipo, categorias, activo)
     values ($1, $2, $3, $4, $5, $6, $7, true)`,
    [id, p.nombre, p.direccion, p.telefono, p.pedido, p.tipo, p.categorias]
  );
  res.json({ ok: true, cliente: { id, nombre: p.nombre, direccion: p.direccion, telefono: p.telefono, pedido: p.pedido, tipo: p.tipo, categorias: p.categorias } });
});

clientesRouter.patch('/clientes/:id', requireAuth, async (req, res) => {
  if (!requireAltaEdicionClientes(req as ReqWithUser, res)) return;
  const parsed = editarClienteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  await ensureClientesTable();
  const p = parsed.data;
  const up = await pool.query(
    `update clientes
     set nombre = $2, direccion = $3, telefono = $4, pedido = $5, tipo = $6, categorias = $7
     where id = $1 and activo = true`,
    [req.params.id, p.nombre, p.direccion, p.telefono, p.pedido, p.tipo, p.categorias]
  );
  if (up.rowCount === 0) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  res.json({
    ok: true,
    cliente: {
      id: req.params.id,
      nombre: p.nombre,
      direccion: p.direccion,
      telefono: p.telefono,
      pedido: p.pedido,
      tipo: p.tipo,
      categorias: p.categorias,
    },
  });
});

clientesRouter.delete('/clientes/:id', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  await ensureClientesTable();
  const del = await pool.query(
    `update clientes
     set activo = false
     where id = $1 and activo = true`,
    [req.params.id]
  );
  if (del.rowCount === 0) {
    res.status(404).json({ error: 'Cliente no encontrado.' });
    return;
  }
  res.json({ ok: true });
});
