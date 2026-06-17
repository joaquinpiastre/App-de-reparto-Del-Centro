import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMobileKeyOrAuth } from '../auth.js';
import { pool } from '../db/client.js';
type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' | 'logistica' } };

const dispositivoSchema = z.object({
  imei: z.string().regex(/^\d{15}$/, 'IMEI debe ser 15 dígitos numéricos'),
  repartidorId: z.string().min(3),
  nombre: z.string().min(2),
});

const gpsUpdateSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
  nombre: z.string().min(2).optional(),
  lat: z.number(),
  lng: z.number(),
  velocidad: z.number().optional(),
  precision: z.number().optional(),
  timestamp: z.number().int().positive(),
});

export const gpsRouter = Router();

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function detectStops(
  points: Array<{ lat: number; lng: number; timestamp: number; velocidad: number | null }>
): Array<{ lat: number; lng: number; inicio: number; fin: number; duracionSegundos: number }> {
  const stops: Array<{ lat: number; lng: number; inicio: number; fin: number; duracionSegundos: number }> = [];
  if (points.length < 2) return stops;
  const maxDriftMeters = 35;
  const minStopMs = 60 * 1000; // 1 minuto mínimo para detectar parada
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dist = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const slow = (curr.velocidad ?? 0) <= 1.5;
    const still = dist <= maxDriftMeters || slow;
    if (!still) {
      const inicio = points[start].timestamp;
      const fin = prev.timestamp;
      if (fin - inicio >= minStopMs) {
        const slice = points.slice(start, i);
        const lat = slice.reduce((acc, p) => acc + p.lat, 0) / slice.length;
        const lng = slice.reduce((acc, p) => acc + p.lng, 0) / slice.length;
        stops.push({
          lat,
          lng,
          inicio,
          fin,
          duracionSegundos: Math.round((fin - inicio) / 1000),
        });
      }
      start = i;
    }
  }
  const lastInicio = points[start].timestamp;
  const lastFin = points[points.length - 1].timestamp;
  if (lastFin - lastInicio >= minStopMs) {
    const slice = points.slice(start);
    const lat = slice.reduce((acc, p) => acc + p.lat, 0) / slice.length;
    const lng = slice.reduce((acc, p) => acc + p.lng, 0) / slice.length;
    stops.push({
      lat,
      lng,
      inicio: lastInicio,
      fin: lastFin,
      duracionSegundos: Math.round((lastFin - lastInicio) / 1000),
    });
  }
  return stops;
}

gpsRouter.post('/gps/update', requireMobileKeyOrAuth, async (req, res) => {
  const parsed = gpsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const p = parsed.data;
  const nombre = p.nombre ?? p.repartidorId.replace(/^usr-/, 'Repartidor ');

  // Solo crear si no existe; si ya existe, solo actualizar activo=true para no pisar el nombre del admin
  await pool.query(
    `insert into repartidores (id, nombre, rol, activo)
     values ($1, $2, 'repartidor', true)
     on conflict (id) do update set activo = true`,
    [p.repartidorId, nombre]
  );

  await pool.query(
    `insert into jornadas (id, repartidor_id, iniciada_en, estado)
     values ($1, $2, to_timestamp($3 / 1000.0), 'abierta')
     on conflict (id) do update set repartidor_id = excluded.repartidor_id`,
    [p.jornadaId, p.repartidorId, p.timestamp]
  );

  await pool.query(
    `insert into gps_points
    (jornada_id, repartidor_id, lat, lng, velocidad, precision, timestamp_ms)
    values ($1, $2, $3, $4, $5, $6, $7)`,
    [p.jornadaId, p.repartidorId, p.lat, p.lng, p.velocidad ?? null, p.precision ?? null, p.timestamp]
  );

  // Limpieza de puntos GPS con más de 30 días — se ejecuta en ~1% de las peticiones
  // para no añadir latencia perceptible. Los datos de presencia (pres-*) son los que
  // más acumulan y no se necesitan pasados los 30 días.
  if (Math.random() < 0.01) {
    void pool.query(
      `delete from gps_points where timestamp_ms < $1`,
      [Date.now() - 30 * 24 * 60 * 60 * 1000]
    );
  }

  res.json({ ok: true });
});

// Endpoint compatible con el protocolo OsmAnd (usado por la app "Traccar Client").
// Se expone sin auth porque Traccar Client no permite mandar headers Authorization;
// la validación es que `id` coincida con un repartidor existente en la base.
// GET /gps/traccar?id=<repartidorId>&lat=...&lon=...&timestamp=...&speed=...&accuracy=...
gpsRouter.get('/gps/traccar', async (req, res) => {
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lon);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).send('invalid');
    return;
  }

  const repartidor = await pool.query<{ id: string }>(
    `select id from repartidores where id = $1`,
    [id]
  );
  if (repartidor.rowCount === 0) {
    res.status(404).send('unknown device');
    return;
  }

  let timestampMs = Number(req.query.timestamp);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    timestampMs = Date.now();
  } else if (timestampMs < 10_000_000_000) {
    timestampMs *= 1000; // OsmAnd manda timestamp en segundos
  }

  const velocidad = Number(req.query.speed);
  const precision = Number(req.query.accuracy);

  // Reusar la jornada abierta más reciente (real o de presencia); si no hay ninguna, crear una de presencia
  const jornadaAbierta = await pool.query<{ id: string }>(
    `select id from jornadas where repartidor_id = $1 and estado = 'abierta' order by iniciada_en desc limit 1`,
    [id]
  );
  let jornadaId: string;
  if (jornadaAbierta.rowCount && jornadaAbierta.rowCount > 0) {
    jornadaId = jornadaAbierta.rows[0].id;
  } else {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    jornadaId = `pres-${id}-${fecha}`;
    await pool.query(
      `insert into jornadas (id, repartidor_id, iniciada_en, estado)
       values ($1, $2, now(), 'abierta')
       on conflict (id) do nothing`,
      [jornadaId, id]
    );
  }

  await pool.query(
    `insert into gps_points
    (jornada_id, repartidor_id, lat, lng, velocidad, precision, timestamp_ms)
    values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      jornadaId,
      id,
      lat,
      lng,
      Number.isFinite(velocidad) ? velocidad : null,
      Number.isFinite(precision) ? precision : null,
      timestampMs,
    ]
  );

  res.status(200).send('OK');
});

gpsRouter.get('/gps/live', requireAuth, async (_req, res) => {
  const { rows } = await pool.query<{
    id: string;
    nombre: string;
    lat: number;
    lng: number;
    precision: number | null;
    actualizadoEn: number;
  }>(
    `select distinct on (gp.repartidor_id)
       gp.repartidor_id as id,
       r.nombre,
       gp.lat,
       gp.lng,
       gp.precision,
       gp.timestamp_ms as "actualizadoEn"
     from gps_points gp
     join repartidores r on r.id = gp.repartidor_id
     where gp.timestamp_ms > extract(epoch from now() - interval '24 hours') * 1000
     order by gp.repartidor_id, gp.timestamp_ms desc`
  );

  const telefonos = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    posicion: { lat: Number(r.lat), lng: Number(r.lng) },
    actualizadoEn: Number(r.actualizadoEn),
    precision: r.precision == null ? undefined : Number(r.precision),
  }));
  res.json({ telefonos });
});

gpsRouter.get('/gps/jornadas/:jornadaId/recorrido', requireAuth, async (req, res) => {
  const user = (req as ReqWithUser).user;
  if (user?.rol !== 'admin' && user?.rol !== 'repartidor' && user?.rol !== 'logistica') {
    res.status(403).json({ error: 'No autorizado.' });
    return;
  }
  const jornadaId = req.params.jornadaId;
  const jornada = await pool.query<{ repartidor_id: string }>(
    `select repartidor_id from jornadas where id = $1`,
    [jornadaId]
  );
  if (jornada.rowCount === 0) {
    res.status(404).json({ error: 'Jornada no encontrada.' });
    return;
  }
  const repartidorId = jornada.rows[0].repartidor_id;
  if (user?.rol === 'repartidor' && user.sub !== repartidorId) {
    res.status(403).json({ error: 'No autorizado para esta jornada.' });
    return;
  }
  const { rows } = await pool.query<{
    lat: number;
    lng: number;
    timestamp_ms: number;
    velocidad: number | null;
  }>(
    `select lat, lng, timestamp_ms, velocidad
     from gps_points
     where jornada_id = $1
     order by timestamp_ms asc`,
    [jornadaId]
  );
  const points = rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lng),
    timestamp: Number(r.timestamp_ms),
    velocidad: r.velocidad == null ? null : Number(r.velocidad),
  }));
  const stops = detectStops(points);

  // Paradas explícitas de visitas marcadas por el repartidor
  type VisitRow = {
    hora_llegada_ms: number;
    hora_salida_ms: number;
    nombre: string;
    estado: string;
    lat: number | null;
    lng: number | null;
  };
  const visitRows = await pool.query<VisitRow>(
    `select a.hora_llegada_ms, a.hora_salida_ms, c.nombre, a.estado,
       (select gp.lat from gps_points gp
        where gp.jornada_id = $1
        order by abs(gp.timestamp_ms - a.hora_llegada_ms) asc
        limit 1) as lat,
       (select gp.lng from gps_points gp
        where gp.jornada_id = $1
        order by abs(gp.timestamp_ms - a.hora_llegada_ms) asc
        limit 1) as lng
     from asignaciones a
     join clientes c on c.id = a.cliente_id
     where a.jornada_id = $1
       and a.hora_llegada_ms is not null
       and a.estado in ('entregado', 'problema')
     order by a.hora_llegada_ms asc`,
    [jornadaId]
  ).catch(() => ({ rows: [] as VisitRow[] }));

  const visitStops = visitRows.rows
    .filter((r: VisitRow) => r.lat != null && r.lng != null)
    .map((r: VisitRow) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      inicio: Number(r.hora_llegada_ms),
      fin: r.hora_salida_ms != null ? Number(r.hora_salida_ms) : Number(r.hora_llegada_ms),
      duracionSegundos: r.hora_salida_ms != null
        ? Math.max(0, Math.round((Number(r.hora_salida_ms) - Number(r.hora_llegada_ms)) / 1000))
        : 0,
      nombre: r.nombre,
      estado: r.estado as 'entregado' | 'problema',
    }));

  res.json({ jornadaId, repartidorId, points, stops, visitStops });
});

// ─── Gestión de dispositivos GPS físicos (trackers GT06) ─────────────────────

// GET /admin/dispositivos-gps — lista todos los trackers registrados
gpsRouter.get('/admin/dispositivos-gps', requireAuth, async (req, res) => {
  const user = (req as ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'No autorizado.' }); return; }

  const { rows } = await pool.query<{
    imei: string; repartidor_id: string; nombre: string;
    activo: boolean; ultimo_contacto_ms: number | null;
  }>(
    `select d.imei, d.repartidor_id, d.nombre, d.activo, d.ultimo_contacto_ms
     from dispositivos_gps d order by d.nombre`
  );
  res.json({ dispositivos: rows });
});

// POST /admin/dispositivos-gps — registra o actualiza un tracker
gpsRouter.post('/admin/dispositivos-gps', requireAuth, async (req, res) => {
  const user = (req as ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'No autorizado.' }); return; }

  const parsed = dispositivoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Datos inválidos.', detalle: parsed.error.flatten() }); return; }

  const { imei, repartidorId, nombre } = parsed.data;

  // Verificar que el repartidor existe
  const rep = await pool.query(`select id from repartidores where id = $1`, [repartidorId]);
  if (!rep.rowCount) { res.status(404).json({ error: 'Repartidor no encontrado.' }); return; }

  await pool.query(
    `insert into dispositivos_gps (imei, repartidor_id, nombre, activo)
     values ($1, $2, $3, true)
     on conflict (imei) do update set repartidor_id = $2, nombre = $3, activo = true`,
    [imei, repartidorId, nombre]
  );
  res.json({ ok: true });
});

// DELETE /admin/dispositivos-gps/:imei — desactiva un tracker
gpsRouter.delete('/admin/dispositivos-gps/:imei', requireAuth, async (req, res) => {
  const user = (req as ReqWithUser).user;
  if (user?.rol !== 'admin') { res.status(403).json({ error: 'No autorizado.' }); return; }

  await pool.query(
    `update dispositivos_gps set activo = false where imei = $1`,
    [req.params.imei]
  );
  res.json({ ok: true });
});
