create extension if not exists "pgcrypto";

create table if not exists repartidores (
  id text primary key,
  nombre text not null,
  rol text not null default 'repartidor',
  activo boolean not null default true,
  pin text not null default '1234',
  created_at timestamptz not null default now()
);

create table if not exists jornadas (
  id text primary key,
  repartidor_id text not null references repartidores(id),
  iniciada_en timestamptz not null default now(),
  cerrada_en timestamptz,
  estado text not null default 'abierta'
);

create table if not exists gps_points (
  id uuid primary key default gen_random_uuid(),
  jornada_id text not null references jornadas(id),
  repartidor_id text not null references repartidores(id),
  lat double precision not null,
  lng double precision not null,
  velocidad double precision,
  precision double precision,
  timestamp_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gps_points_rep_ts
  on gps_points (repartidor_id, timestamp_ms desc);

create index if not exists idx_gps_points_jornada_ts
  on gps_points (jornada_id, timestamp_ms desc);

-- Mapea IMEI de tracker físico (GT06, etc.) al repartidor correspondiente
create table if not exists dispositivos_gps (
  imei text primary key,
  repartidor_id text not null references repartidores(id),
  nombre text not null,
  activo boolean not null default true,
  ultimo_contacto_ms bigint,
  created_at timestamptz not null default now()
);

create table if not exists pedidos_calle (
  id text primary key,
  calle_normalizada text not null,
  calle_mostrada text not null,
  repartidor_id text not null references repartidores(id),
  repartidor_nombre text not null,
  total numeric(12,2) not null default 0,
  notas text,
  clientes_misma_calle jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente',
  creado_en_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pedidos_estado_created
  on pedidos_calle (estado, creado_en_ms desc);

create table if not exists pedido_calle_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null references pedidos_calle(id) on delete cascade,
  codigo text,
  descripcion text not null,
  cantidad integer not null,
  precio_unitario numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

create table if not exists entregas (
  id uuid primary key default gen_random_uuid(),
  jornada_id text not null references jornadas(id),
  repartidor_id text not null references repartidores(id),
  cliente_id text not null,
  estado text not null,
  hora_llegada_ms bigint,
  hora_entrega_ms bigint,
  tiempo_parada_segundos integer,
  foto_url text,
  firma_url text,
  notas_repartidor text,
  created_at timestamptz not null default now()
);

create table if not exists pedidos_admin (
  id text primary key,
  titulo text not null,
  calles jsonb not null default '[]'::jsonb,
  repartidor_id text not null references repartidores(id),
  repartidor_nombre text not null,
  total numeric(12,2) not null default 0,
  notas text,
  estado text not null default 'pendiente',
  creado_por_id text,
  creado_por_nombre text,
  creado_en_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pedidos_admin_estado_created
  on pedidos_admin (estado, creado_en_ms desc);

create table if not exists pedidos_admin_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null references pedidos_admin(id) on delete cascade,
  descripcion text not null,
  cantidad integer not null,
  precio_unitario numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

-- Registro de cobros realizados por los repartidores en la calle
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id text not null,
  cliente_nombre text not null,
  repartidor_id text not null references repartidores(id),
  repartidor_nombre text not null,
  monto numeric(12,2) not null,
  metodo text not null,
  numero_cheque text,
  banco text,
  observaciones text,
  creado_en_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pagos_repartidor_created
  on pagos (repartidor_id, created_at desc);

create index if not exists idx_pagos_created
  on pagos (created_at desc);
