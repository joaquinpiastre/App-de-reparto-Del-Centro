import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';
type ReqWithUser = { user?: { sub: string; rol: 'admin' | 'repartidor' | 'logistica'; nombre?: string } };

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

const cierreSchema = z.object({
  jornadaId: z.string().min(3),
  repartidorId: z.string().min(3),
  repartidorNombre: z.string().min(2),
  completados: z.number().int().min(0),
  total: z.number().int().min(0),
  minutosEnRuta: z.number().int().min(1),
  fechaIso: z.string().optional(),
});

export const entregasRouter = Router();

function requireAdmin(req: ReqWithUser, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo admins pueden ver reportes.' });
    return false;
  }
  return true;
}

function requireAdminOrLogistica(
  req: ReqWithUser,
  res: { status: (n: number) => { json: (b: unknown) => void } }
): boolean {
  if (req.user?.rol !== 'admin' && req.user?.rol !== 'logistica') {
    res.status(403).json({ error: 'Solo admins y logística pueden ver reportes.' });
    return false;
  }
  return true;
}

// Consumo aproximado por hora de ruta urbana de reparto, estimado a partir de
// una velocidad promedio típica y el consumo cada 100 km de cada vehículo
// (moto ≈ 35 km/h x 2.5 L/100km, auto ≈ 30 km/h x 8.5 L/100km).
const LITROS_POR_HORA: Record<'auto' | 'moto', number> = {
  moto: 0.9,
  auto: 2.6,
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

async function ensureTipoVehiculoColumn(): Promise<void> {
  await pool.query(
    `alter table repartidores add column if not exists tipo_vehiculo text not null default 'moto'`
  );
}

function normalizeImagePayload(value?: string | null, mime = 'image/png'): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('data:image/') && raw.includes(';base64,')) {
    // Corrige payloads duplicados: data:image/...;base64,data:image/...;base64,AAA...
    const dupMarker = raw.indexOf('data:image/', 20);
    if (dupMarker > 0) {
      return raw.slice(dupMarker);
    }
    return raw;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('file://')) {
    return raw;
  }
  const sanitized = raw.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  return `data:${mime};base64,${sanitized}`;
}

async function ensureCierresTable(): Promise<void> {
  await pool.query(
    `create table if not exists cierres_jornada (
      id uuid primary key default gen_random_uuid(),
      jornada_id text not null,
      repartidor_id text not null references repartidores(id),
      repartidor_nombre text not null,
      completados integer not null,
      total integer not null,
      minutos_en_ruta integer not null,
      fecha_iso text,
      created_at timestamptz not null default now()
    )`
  );
}

async function ensureRepartidorYJornada(
  jornadaId: string,
  repartidorId: string,
  repartidorNombre?: string
): Promise<void> {
  const nombre = repartidorNombre?.trim() || repartidorId.replace(/^usr-/, 'Repartidor ');
  await pool.query(
    `insert into repartidores (id, nombre, rol, activo)
     values ($1, $2, 'repartidor', true)
     on conflict (id) do update set activo = true`,
    [repartidorId, nombre]
  );
  await pool.query(
    `insert into jornadas (id, repartidor_id, estado)
     values ($1, $2, 'abierta')
     on conflict (id) do nothing`,
    [jornadaId, repartidorId]
  );
}

entregasRouter.post('/entregas', requireAuth, async (req, res) => {
  const parsed = entregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const e = parsed.data;
  await ensureRepartidorYJornada(e.jornadaId, e.repartidorId);
  const firmaUrl = normalizeImagePayload(e.firmaUrl ?? e.firmaBase64 ?? null, 'image/png');
  const fotoUrl = normalizeImagePayload(e.fotoUrl ?? null, 'image/jpeg');

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
      fotoUrl,
      firmaUrl,
      e.notasRepartidor ?? null,
    ]
  );
  res.json({ ok: true });
});

entregasRouter.post('/cierres-jornada', requireAuth, async (req, res) => {
  const parsed = cierreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.' });
    return;
  }
  const c = parsed.data;
  await ensureCierresTable();
  await ensureRepartidorYJornada(c.jornadaId, c.repartidorId, c.repartidorNombre);
  await pool.query(
    `insert into cierres_jornada
     (jornada_id, repartidor_id, repartidor_nombre, completados, total, minutos_en_ruta, fecha_iso)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [c.jornadaId, c.repartidorId, c.repartidorNombre, c.completados, c.total, c.minutosEnRuta, c.fechaIso ?? null]
  );
  res.json({ ok: true });
});

entregasRouter.get('/admin-reportes/historial', requireAuth, async (req, res) => {
  if (!requireAdminOrLogistica(req as ReqWithUser, res)) return;
  await ensureCierresTable();
  const cierreRes = await pool.query(
    `select
       cj.jornada_id as id,
       coalesce(extract(epoch from cj.created_at) * 1000, extract(epoch from now()) * 1000) as fecha_ms,
       cj.repartidor_nombre,
       cj.completados,
       cj.total,
       cj.minutos_en_ruta
     from cierres_jornada cj
     order by cj.created_at desc
     limit 100`
  );
  const sourceRows = cierreRes.rows;
  const historial = sourceRows.map((x: {
    id: string;
    fecha_ms: number;
    repartidor_nombre: string;
    completados: number;
    total: number;
    minutos_en_ruta: number;
  }) => ({
    id: x.id,
    fechaIso: new Date(Number(x.fecha_ms || Date.now())).toISOString(),
    repartidorNombre: x.repartidor_nombre,
    completados: Number(x.completados ?? 0),
    total: Number(x.total ?? 0),
    minutosEnRuta: Number(x.minutos_en_ruta ?? 1),
  }));
  res.json({ historial });
});

entregasRouter.get('/admin-reportes/historial/:jornadaId/pedidos', requireAuth, async (req, res) => {
  if (!requireAdminOrLogistica(req as ReqWithUser, res)) return;
  const jornadaId = String(req.params.jornadaId ?? '').trim();
  if (!jornadaId) {
    res.status(400).json({ error: 'Jornada inválida.' });
    return;
  }

  await ensureCierresTable();

  // Obtener info del cierre para el fallback por fecha+repartidor
  // Usamos cierres_jornada.created_at como punto de referencia y buscamos 26 horas hacia atrás,
  // porque jornadas.iniciada_en puede ser NOW() si se insertó sin GPS (y los pedidos son ANTERIORES al cierre).
  const cierreInfo = await pool.query<{ repartidor_id: string; created_at: Date }>(
    `select repartidor_id, created_at from cierres_jornada where jornada_id = $1 limit 1`,
    [jornadaId]
  ).catch(() => ({ rows: [] as Array<{ repartidor_id: string; created_at: Date }> }));
  const cierre = cierreInfo.rows[0];

  // Ventana: desde 26 horas antes del cierre hasta 2 horas después (captura turnos nocturnos también)
  const cierreMs = cierre ? new Date(cierre.created_at).getTime() : 0;
  const inicioMs = cierreMs - 26 * 60 * 60 * 1000;
  const finMs    = cierreMs + 2  * 60 * 60 * 1000;

  const pedidosCalleBase = `
    select p.id,
           p.calle_mostrada as titulo,
           p.repartidor_id as "repartidorId",
           p.repartidor_nombre as "repartidorNombre",
           p.total,
           p.notas,
           p.estado,
           p.creado_en_ms as "creadoEn",
           p.cliente_id as "clienteId",
           p.cliente_nombre as "clienteNombre",
           'pedido_calle' as origen,
           coalesce(
             json_agg(
               json_build_object(
                 'descripcion', i.descripcion,
                 'cantidad', i.cantidad,
                 'precioUnitario', i.precio_unitario,
                 'subtotal', i.subtotal
               )
             ) filter (where i.id is not null),
             '[]'::json
           ) as items
    from pedidos_calle p
    left join pedido_calle_items i on i.pedido_id = p.id`;

  const pedidosCalleQuery = cierre
    ? `${pedidosCalleBase}
       where p.jornada_id = $1
          or (p.jornada_id is null
              and p.repartidor_id = $2
              and p.creado_en_ms >= $3
              and p.creado_en_ms <= $4)
       group by p.id
       order by p.creado_en_ms asc`
    : `${pedidosCalleBase}
       where p.jornada_id = $1
       group by p.id
       order by p.creado_en_ms asc`;

  const pedidosCalleParams = cierre
    ? [jornadaId, cierre.repartidor_id, inicioMs, finMs]
    : [jornadaId];

  const { rows: rowsCalle } = await pool.query(pedidosCalleQuery, pedidosCalleParams);

  // Obtener pedidos_admin asociados a esta jornada (si la columna existe)
  let rowsAdmin: typeof rowsCalle = [];
  try {
    const res2 = await pool.query(
      `select p.id,
              p.titulo,
              p.repartidor_id as "repartidorId",
              p.repartidor_nombre as "repartidorNombre",
              p.total,
              p.notas,
              p.estado,
              p.creado_en_ms as "creadoEn",
              null as "clienteId",
              null as "clienteNombre",
              'pedido_admin' as origen,
              coalesce(
                json_agg(
                  json_build_object(
                    'descripcion', i.descripcion,
                    'cantidad', i.cantidad,
                    'precioUnitario', i.precio_unitario,
                    'subtotal', i.subtotal
                  )
                ) filter (where i.id is not null),
                '[]'::json
              ) as items
       from pedidos_admin p
       left join pedidos_admin_items i on i.pedido_id = p.id
       where p.jornada_id = $1
       group by p.id
       order by p.creado_en_ms asc`,
      [jornadaId]
    );
    rowsAdmin = res2.rows;
  } catch {
    // columna jornada_id puede no existir en instancias antiguas
  }

  const todos = [...rowsCalle, ...rowsAdmin].sort(
    (a, b) => Number(a.creadoEn ?? 0) - Number(b.creadoEn ?? 0)
  );

  res.json({
    pedidos: todos.map((r) => ({ ...r, creadoEn: Number(r.creadoEn ?? 0), total: Number(r.total ?? 0) })),
  });
});

entregasRouter.get('/admin-reportes/historial/:jornadaId/entregas', requireAuth, async (req, res) => {
  if (!requireAdminOrLogistica(req as ReqWithUser, res)) return;
  const jornadaId = String(req.params.jornadaId ?? '').trim();
  if (!jornadaId) {
    res.status(400).json({ error: 'Jornada inválida.' });
    return;
  }
  const { rows } = await pool.query(
    `select
       a.id,
       a.cliente_id as "clienteId",
       c.nombre as "clienteNombre",
       c.direccion as "clienteDireccion",
       c.tipo as "clienteTipo",
       a.estado,
       a.hora_llegada_ms as "horaLlegada",
       a.hora_salida_ms as "horaSalida",
       a.notas_repartidor as "notasRepartidor"
     from asignaciones a
     join clientes c on c.id = a.cliente_id
     where a.jornada_id = $1
     order by a.hora_llegada_ms asc nulls last, a.creado_en asc`,
    [jornadaId]
  );
  res.json({ entregas: rows });
});

entregasRouter.get('/admin-reportes/stats', requireAuth, async (req, res) => {
  if (!requireAdminOrLogistica(req as ReqWithUser, res)) return;
  await ensureCierresTable();

  const [totalesRes, cierresRes, topRes] = await Promise.all([
    pool.query(
      `select
         count(*)::int as jornadas,
         coalesce(sum(completados), 0)::int as entregas,
         greatest(coalesce(sum(total - completados), 0), 0)::int as incidencias
       from cierres_jornada`
    ),
    pool.query(
      `select
         jornada_id as id,
         extract(epoch from created_at) * 1000 as fecha_ms,
         completados,
         minutos_en_ruta
       from cierres_jornada
       order by created_at desc
       limit 6`
    ),
    pool.query(
      `select
         cj.repartidor_id as id,
         cj.repartidor_nombre as nombre,
         coalesce(sum(cj.completados), 0)::int as entregas
       from cierres_jornada cj
       group by cj.repartidor_id, cj.repartidor_nombre
       order by entregas desc, cj.repartidor_nombre asc
       limit 5`
    ),
  ]);

  const t = totalesRes.rows[0] as { jornadas: number; entregas: number; incidencias: number } | undefined;
  const cierres = cierresRes.rows as Array<{
    id: string;
    fecha_ms: number;
    completados: number;
    minutos_en_ruta: number;
  }>;
  const promedioMinutos =
    cierres.length > 0
      ? Math.round(cierres.reduce((acc, c) => acc + Number(c.minutos_en_ruta || 0), 0) / cierres.length)
      : 0;

  res.json({
    resumen: {
      jornadas: Number(t?.jornadas ?? 0),
      entregas: Number(t?.entregas ?? 0),
      incidencias: Number(t?.incidencias ?? 0),
      promedioMinutosRuta: promedioMinutos,
    },
    series: {
      labels: cierres.map((_c, i) => String(i + 1)),
      entregas: cierres.map((c) => Number(c.completados ?? 0)),
      minutos: cierres.map((c) => Number(c.minutos_en_ruta ?? 0)),
    },
    topRepartidores: (topRes.rows as Array<{ id: string; nombre: string; entregas: number }>).map((x) => ({
      id: x.id,
      nombre: x.nombre,
      entregas: Number(x.entregas ?? 0),
    })),
  });
});

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface RangoMes {
  anio: number;
  mes: number; // 1-12
  etiqueta: string;
  desdeFecha: string; // YYYY-MM-DD, para columnas `date`
  hastaFecha: string; // exclusivo
  desdeTs: Date; // para columnas `timestamptz`
  hastaTs: Date; // exclusivo
}

function rangoDelMes(anio: number, mesIndex0: number): RangoMes {
  const desde = new Date(anio, mesIndex0, 1, 0, 0, 0, 0);
  const hasta = new Date(anio, mesIndex0 + 1, 1, 0, 0, 0, 0);
  const fmtFecha = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    anio: desde.getFullYear(),
    mes: desde.getMonth() + 1,
    etiqueta: `${MESES[desde.getMonth()]} ${desde.getFullYear()}`,
    desdeFecha: fmtFecha(desde),
    hastaFecha: fmtFecha(hasta),
    desdeTs: desde,
    hastaTs: hasta,
  };
}

function rangoMesActual(): RangoMes {
  const ahora = new Date();
  return rangoDelMes(ahora.getFullYear(), ahora.getMonth());
}

async function ensureReportesMensualesTable(): Promise<void> {
  await pool.query(
    `create table if not exists reportes_mensuales (
      id uuid primary key default gen_random_uuid(),
      anio integer not null,
      mes integer not null,
      datos jsonb not null,
      guardado_por_id text,
      guardado_por_nombre text,
      created_at timestamptz not null default now(),
      unique (anio, mes)
    )`
  );
}

async function calcularDashboardInicio(rango: RangoMes) {
  const { desdeFecha, hastaFecha, desdeTs, hastaTs } = rango;

  const [topClientesRes, combustibleRes, visitasPorDiaRes, paradaRes] = await Promise.all([
    pool.query(
      `with vcr as (
         select a.cliente_id, a.repartidor_id, count(*)::int as visitas
           from asignaciones a
          where a.estado = 'entregado'
            and a.fecha_programada >= $1 and a.fecha_programada < $2
          group by a.cliente_id, a.repartidor_id
       ),
       totales as (
         select cliente_id, sum(visitas)::int as visitas
           from vcr
          group by cliente_id
       ),
       top_rep as (
         select distinct on (cliente_id) cliente_id, repartidor_id, visitas as visitas_repartidor
           from vcr
          order by cliente_id, visitas desc, repartidor_id asc
       )
       select c.id, c.nombre, c.direccion, c.tipo, t.visitas,
              r.id as "repartidorTopId", r.nombre as "repartidorTopNombre",
              tr.visitas_repartidor as "repartidorTopVisitas"
         from totales t
         join clientes c on c.id = t.cliente_id
         left join top_rep tr on tr.cliente_id = t.cliente_id
         left join repartidores r on r.id = tr.repartidor_id
        order by t.visitas desc, c.nombre asc`,
      [desdeFecha, hastaFecha]
    ),
    pool.query(
      `select r.id, r.nombre, r.tipo_vehiculo as "tipoVehiculo",
              coalesce(sum(cj.minutos_en_ruta), 0)::int as "minutosEnRuta"
         from repartidores r
         left join cierres_jornada cj
           on cj.repartidor_id = r.id
          and cj.created_at >= $1 and cj.created_at < $2
        where r.rol = 'repartidor' and r.activo = true
        group by r.id, r.nombre, r.tipo_vehiculo
        order by "minutosEnRuta" desc, r.nombre asc`,
      [desdeTs, hastaTs]
    ),
    pool.query(
      `select extract(isodow from a.fecha_programada)::int as dia,
              count(*)::int as visitas
         from asignaciones a
        where a.estado = 'entregado'
          and a.fecha_programada >= $1 and a.fecha_programada < $2
        group by dia`,
      [desdeFecha, hastaFecha]
    ),
    pool.query(
      `select coalesce(avg(tiempo_parada_segundos), 0)::int as promedio
         from entregas
        where tiempo_parada_segundos is not null and tiempo_parada_segundos > 0
          and created_at >= $1 and created_at < $2`,
      [desdeTs, hastaTs]
    ),
  ]);

  const topClientes = (
    topClientesRes.rows as Array<{
      id: string;
      nombre: string;
      direccion: string;
      tipo: 'cliente' | 'taller';
      visitas: number;
      repartidorTopId: string | null;
      repartidorTopNombre: string | null;
      repartidorTopVisitas: number | null;
    }>
  ).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    direccion: c.direccion,
    tipo: c.tipo,
    visitas: Number(c.visitas ?? 0),
    repartidorTop:
      c.repartidorTopId && c.repartidorTopNombre
        ? { id: c.repartidorTopId, nombre: c.repartidorTopNombre, visitas: Number(c.repartidorTopVisitas ?? 0) }
        : null,
  }));

  const porRepartidor = (
    combustibleRes.rows as Array<{
      id: string;
      nombre: string;
      tipoVehiculo: string;
      minutosEnRuta: number;
    }>
  ).map((r) => {
    const tipoVehiculo: 'auto' | 'moto' = r.tipoVehiculo === 'auto' ? 'auto' : 'moto';
    const minutosEnRuta = Number(r.minutosEnRuta ?? 0);
    const litrosEstimados = Math.round((minutosEnRuta / 60) * LITROS_POR_HORA[tipoVehiculo] * 10) / 10;
    return { id: r.id, nombre: r.nombre, tipoVehiculo, minutosEnRuta, litrosEstimados };
  });
  const totalLitrosEstimados = Math.round(porRepartidor.reduce((acc, r) => acc + r.litrosEstimados, 0) * 10) / 10;

  const visitasPorDiaMap = new Map<number, number>();
  for (const row of visitasPorDiaRes.rows as Array<{ dia: number; visitas: number }>) {
    visitasPorDiaMap.set(Number(row.dia), Number(row.visitas ?? 0));
  }
  const visitasPorDia = {
    labels: DIAS_SEMANA,
    valores: DIAS_SEMANA.map((_d, i) => visitasPorDiaMap.get(i + 1) ?? 0),
  };

  const promedioSegundos = Number((paradaRes.rows[0] as { promedio: number } | undefined)?.promedio ?? 0);

  return {
    periodo: { anio: rango.anio, mes: rango.mes, etiqueta: rango.etiqueta },
    topClientes,
    combustible: { porRepartidor, totalLitrosEstimados },
    visitasPorDia,
    promedioParadaMinutos: Math.round(promedioSegundos / 60),
  };
}

entregasRouter.get('/admin-reportes/inicio', requireAuth, async (req, res) => {
  if (!requireAdminOrLogistica(req as ReqWithUser, res)) return;
  await ensureCierresTable();
  await ensureTipoVehiculoColumn();
  const datos = await calcularDashboardInicio(rangoMesActual());
  res.json(datos);
});

entregasRouter.post('/admin-reportes/inicio/guardar', requireAuth, async (req, res) => {
  if (!requireAdmin(req as ReqWithUser, res)) return;
  await ensureCierresTable();
  await ensureTipoVehiculoColumn();
  await ensureReportesMensualesTable();

  const user = (req as ReqWithUser).user;
  const rango = rangoMesActual();
  const datos = await calcularDashboardInicio(rango);

  const { rows } = await pool.query(
    `insert into reportes_mensuales (anio, mes, datos, guardado_por_id, guardado_por_nombre)
     values ($1, $2, $3::jsonb, $4, $5)
     on conflict (anio, mes) do update
       set datos = excluded.datos,
           guardado_por_id = excluded.guardado_por_id,
           guardado_por_nombre = excluded.guardado_por_nombre,
           created_at = now()
     returning id, anio, mes, extract(epoch from created_at) * 1000 as "guardadoEnMs"`,
    [rango.anio, rango.mes, JSON.stringify(datos), user?.sub ?? null, user?.nombre ?? null]
  );
  const row = rows[0] as { id: string; anio: number; mes: number; guardadoEnMs: number };

  res.json({
    ok: true,
    reporte: {
      id: row.id,
      anio: row.anio,
      mes: row.mes,
      etiqueta: rango.etiqueta,
      guardadoEn: Number(row.guardadoEnMs),
      datos,
    },
  });
});

entregasRouter.get('/admin-reportes/inicio/historial', requireAuth, async (req, res) => {
  if (!requireAdminOrLogistica(req as ReqWithUser, res)) return;
  await ensureReportesMensualesTable();

  const { rows } = await pool.query(
    `select id, anio, mes, datos, extract(epoch from created_at) * 1000 as "guardadoEnMs"
       from reportes_mensuales
      order by anio desc, mes desc
      limit 24`
  );

  res.json({
    reportes: (
      rows as Array<{ id: string; anio: number; mes: number; datos: unknown; guardadoEnMs: number }>
    ).map((r) => ({
      id: r.id,
      anio: Number(r.anio),
      mes: Number(r.mes),
      etiqueta: `${MESES[Number(r.mes) - 1]} ${r.anio}`,
      guardadoEn: Number(r.guardadoEnMs),
      datos: r.datos,
    })),
  });
});
