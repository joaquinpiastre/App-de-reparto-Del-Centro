import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, signToken } from '../auth.js';
import { pool } from '../db/client.js';

const loginSchema = z.object({
  usuario: z.string().trim().min(2),
  pin: z.string().trim().length(4),
});

const DEMO_PIN = process.env.DEMO_PIN ?? '1234';

export const authRouter = Router();

async function ensurePinColumn(): Promise<void> {
  await pool.query(`alter table repartidores add column if not exists pin text`);
  await pool.query(`update repartidores set pin = $1 where pin is null or length(trim(pin)) = 0`, [
    DEMO_PIN,
  ]);
}

authRouter.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }

  const { usuario, pin } = parsed.data;
  await ensurePinColumn();

  const cleaned = usuario.toLowerCase();
  const id = cleaned.startsWith('usr-') ? cleaned : `usr-${cleaned}`;

  const existente = await pool.query(
    `select id, nombre, rol, activo, pin
     from repartidores
     where id = $1`,
    [id]
  );
  let rol: 'admin' | 'repartidor' | 'logistica';
  let nombre: string;
  let activo = true;

  if ((existente.rowCount ?? 0) > 0) {
    const row = existente.rows[0] as {
      nombre: string;
      rol: 'admin' | 'repartidor' | 'logistica';
      activo: boolean;
      pin: string | null;
    };
    rol = row.rol;
    nombre = row.nombre;
    activo = row.activo;
    const pinReal = (row.pin ?? DEMO_PIN).trim();
    if (!activo) {
      res.status(403).json({ error: 'Usuario inactivo. Contactá al administrador.' });
      return;
    }
    if (pin !== pinReal) {
      res.status(401).json({ error: 'PIN inválido.' });
      return;
    }
  } else {
    // Usuario no encontrado en la base de datos. No se auto-crean usuarios: el admin debe crearlos.
    res.status(401).json({ error: 'Usuario no encontrado. Pedile al administrador que te cree un acceso.' });
    return;
  }

  const token = signToken({ sub: id, nombre, rol });
  res.json({
    token,
    usuario: { id, nombre, rol, activo },
  });
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  await ensurePinColumn();
  const user = (req as { user?: { sub: string; nombre: string; rol: 'admin' | 'repartidor' | 'logistica' } }).user;
  if (!user?.sub) {
    res.status(401).json({ error: 'Token inválido.' });
    return;
  }
  const db = await pool.query(
    `select id, nombre, rol, activo
     from repartidores
     where id = $1`,
    [user.sub]
  );
  if ((db.rowCount ?? 0) > 0) {
    const row = db.rows[0] as { id: string; nombre: string; rol: 'admin' | 'repartidor' | 'logistica'; activo: boolean };
    if (!row.activo) {
      res.status(403).json({ error: 'Usuario inactivo.' });
      return;
    }
    res.json({ usuario: row });
    return;
  }
  res.json({
    usuario: { id: user.sub, nombre: user.nombre, rol: user.rol, activo: true },
  });
});
