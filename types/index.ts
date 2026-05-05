export type RolUsuario = 'repartidor' | 'admin';
export type EstadoEntrega = 'pendiente' | 'en_camino' | 'entregado' | 'problema';

/** Cliente del catálogo (taller o cliente final). */
export interface ClienteCatalogo {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  tipo: 'cliente' | 'taller';
  pedido?: string;
}

/** Visita asignada por el admin a un repartidor para una fecha. */
export interface Asignacion {
  id: string;
  repartidorId: string;
  clienteId: string;
  cliente: ClienteCatalogo;
  orden: number;
  estado: EstadoEntrega;
  notasAdmin?: string;
  notasRepartidor?: string;
  horaLlegadaMs?: number;
  horaSalidaMs?: number;
  fechaProgramada: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: RolUsuario;
  telefono?: string;
  activo: boolean;
}

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface TelefonoUbicacion {
  id: string;
  nombre: string;
  posicion: Coordenadas;
  actualizadoEn: number;
  precision?: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  pedido: string;
  coordenadas: Coordenadas;
  estado: EstadoEntrega;
  orden: number;
  estimadoMin: number;
  fotoEntregaUri?: string;
  firmaBase64?: string;
  notasRepartidor?: string;
  tiempoParadaSegundos?: number;
}

/** Ítem de lista de precios importada desde Excel. */
export interface ProductoLista {
  codigo: string;
  descripcion: string;
  precioUnitario: number;
}

/** Línea de un pedido levantado en calle. */
export interface LineaPedidoCalle {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export type EstadoPedidoCalle = 'pendiente' | 'visto' | 'armado' | 'retirado' | 'cancelado';

export interface PedidoCalle {
  id: string;
  calleNormalizada: string;
  calleMostrada: string;
  repartidorId: string;
  repartidorNombre: string;
  items: LineaPedidoCalle[];
  total: number;
  notas?: string;
  clientesMismaCalle: { nombre: string; direccion: string }[];
  estado: EstadoPedidoCalle;
  creadoEn: number;
}

export interface Entrega {
  clienteId: string;
  estado: EstadoEntrega;
  horaLlegada?: number;
  horaEntrega?: number;
  tiempoParadaSegundos?: number;
  fotoUrl?: string;
  firmaBase64?: string;
  notasRepartidor?: string;
}

export interface PedidoAdminItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export type EstadoPedidoAdmin =
  | 'pendiente'
  | 'asignado'
  | 'en_ruta'
  | 'entregado'
  | 'cancelado';

export interface PedidoAdmin {
  id: string;
  titulo: string;
  calles: string[];
  repartidorId: string;
  repartidorNombre: string;
  items: PedidoAdminItem[];
  total: number;
  notas?: string;
  estado: EstadoPedidoAdmin;
  creadoEn: number;
  creadoPorId?: string;
  creadoPorNombre?: string;
}
