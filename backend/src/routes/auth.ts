import { Router } from 'express';
import { z } from 'zod';
import { signToken } from '../auth.js';
import { pool } from '../db/client.js';

const loginSchema = z.object({
  usuario: z.string().trim().min(2),
  pin: z.string().trim().length(4),
});

const DEMO_PIN = process.env.DEMO_PIN ?? '1234';

export const authRouter = Router();

authRouter.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }

  const { usuario, pin } = parsed.data;
  if (pin !== DEMO_PIN) {
    res.status(401).json({ error: 'PIN inválido.' });
    return;
  }

  const cleaned = usuario.toLowerCase();
  const rol = cleaned.includes('admin') ? 'admin' : 'repartidor';
  const id = cleaned.startsWith('usr-') ? cleaned : `usr-${cleaned}`;
  const nombre = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  await pool.query(
    `insert into repartidores (id, nombre, rol, activo)
     values ($1, $2, $3, true)
     on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, activo = true`,
    [id, nombre, rol]
  );

  const token = signToken({ sub: id, nombre, rol });
  res.json({
    token,
    usuario: { id, nombre, rol, activo: true },
  });
});
