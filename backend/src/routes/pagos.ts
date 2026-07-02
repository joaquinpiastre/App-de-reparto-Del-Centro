import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthClaims } from '../auth.js';
import { pool } from '../db/client.js';

export const pagosRouter = Router();

type ReqWithUser = { user?: AuthClaims };

const METODOS = ['efectivo', 'transferencia', 'cheque', 'otro'] as const;

const pagoSchema = z.object({
  clienteId: z.string().min(1),
  clienteNombre: z.string().min(1),
  monto: z.number().positive(),
  metodo: z.enum(METODOS),
  numeroCheque: z.string().trim().optional(),
  banco: z.string().trim().optional(),
  observaciones: z.string().trim().optional(),
});

// POST /pagos — el repartidor registra un cobro
pagosRouter.post('/pagos', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  const parsed = pagoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos.', detalle: parsed.error.flatten() });
    return;
  }
  const { clienteId, clienteNombre, monto, metodo, numeroCheque, banco, observaciones } = parsed.data;

  const { rows } = await pool.query(
    `insert into pagos
       (cliente_id, cliente_nombre, repartidor_id, repartidor_nombre,
        monto, metodo, numero_cheque, banco, observaciones, creado_en_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, cliente_nombre as "clienteNombre", repartidor_nombre as "repartidorNombre",
               monto, metodo, created_at as "creadoEn"`,
    [
      clienteId,
      clienteNombre,
      user!.sub,
      user!.nombre,
      monto,
      metodo,
      numeroCheque ?? null,
      banco ?? null,
      observaciones ?? null,
      Date.now(),
    ]
  );
  res.json({ pago: rows[0] });
});

// GET /admin/pagos — el admin ve todos los cobros
pagosRouter.get('/admin/pagos', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo el administrador puede ver todos los cobros.' });
    return;
  }

  const { repartidorId, desde, hasta } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (repartidorId) { conditions.push(`repartidor_id = $${idx++}`); params.push(repartidorId); }
  if (desde) { conditions.push(`created_at >= $${idx++}`); params.push(desde); }
  if (hasta) { conditions.push(`created_at < ($${idx++}::date + interval '1 day')`); params.push(hasta); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `select id, cliente_id as "clienteId", cliente_nombre as "clienteNombre",
            repartidor_id as "repartidorId", repartidor_nombre as "repartidorNombre",
            monto, metodo, numero_cheque as "numeroCheque", banco, observaciones,
            created_at as "creadoEn"
     from pagos
     ${where}
     order by created_at desc
     limit 300`,
    params
  );

  const total = rows.reduce((s, p) => s + Number(p.monto), 0);
  res.json({ pagos: rows, total });
});
