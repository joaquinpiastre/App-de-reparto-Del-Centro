import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

const entregaSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
  clienteId: z.string().min(1),
  estado: z.enum(['pendiente', 'en_camino', 'entregado', 'problema']),
  horaLlegada: z.number().optional(),
  horaEntrega: z.number().optional(),
  tiempoParadaSegundos: z.number().int().optional(),
  fotoUrl: z.string().optional(),
  firmaUrl: z.string().optional(),
  firmaBase64: z.string().optional(),
  notasRepartidor: z.string().optional(),
});

export const entregasRouter = Router();

entregasRouter.post('/entregas', requireAuth, async (req, res) => {
  const parsed = entregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const e = parsed.data;
  const firmaUrl = e.firmaUrl ?? (e.firmaBase64 ? `data:image/png;base64,${e.firmaBase64}` : null);

  await pool.query(
    `insert into entregas
    (jornada_id, repartidor_id, cliente_id, estado, hora_llegada_ms, hora_entrega_ms, tiempo_parada_segundos, foto_url, firma_url, notas_repartidor)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      e.jornadaId,
      e.repartidorId,
      e.clienteId,
      e.estado,
      e.horaLlegada ?? null,
      e.horaEntrega ?? null,
      e.tiempoParadaSegundos ?? null,
      e.fotoUrl ?? null,
      firmaUrl,
      e.notasRepartidor ?? null,
    ]
  );
  res.json({ ok: true });
});
