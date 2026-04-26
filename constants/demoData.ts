import type { Cliente } from '@/types';

/** Coordenadas aproximadas San Rafael, Mendoza (demo). */
export const REGION_SAN_RAFAEL = {
  latitude: -34.6177,
  longitude: -68.3301,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

/** Clientes de demostración para probar ruta, mapa y “misma calle”. */
export const CLIENTES_DEMO_SEED: Cliente[] = [
  {
    id: 'c1',
    nombre: 'Juan Pérez',
    direccion: 'Av. San Martín 445',
    telefono: '2604000001',
    pedido: '10 lts látex blanco',
    coordenadas: { lat: -34.6089, lng: -68.3301 },
    estado: 'pendiente',
    orden: 1,
    estimadoMin: 12,
  },
  {
    id: 'c2',
    nombre: 'Ferretería Sur',
    direccion: 'Mitre 220',
    telefono: '2604000002',
    pedido: '20 kg enduido + 2 rodillos',
    coordenadas: { lat: -34.621, lng: -68.339 },
    estado: 'pendiente',
    orden: 2,
    estimadoMin: 10,
  },
  {
    id: 'c3',
    nombre: 'Pinturería Norte',
    direccion: 'Av. San Martín 1200',
    telefono: '2604000003',
    pedido: '4 lts sintético verde',
    coordenadas: { lat: -34.602, lng: -68.328 },
    estado: 'pendiente',
    orden: 3,
    estimadoMin: 11,
  },
  {
    id: 'c4',
    nombre: 'Corralón López',
    direccion: 'Hipólito Yrigoyen 621',
    telefono: '2604000004',
    pedido: '1 cubeta imprimación',
    coordenadas: { lat: -34.6155, lng: -68.332 },
    estado: 'pendiente',
    orden: 4,
    estimadoMin: 8,
  },
  {
    id: 'c5',
    nombre: 'Casa Rodríguez',
    direccion: 'Mitre 540',
    telefono: '2604000005',
    pedido: 'Esmalte sintético negro 1L',
    coordenadas: { lat: -34.623, lng: -68.341 },
    estado: 'pendiente',
    orden: 5,
    estimadoMin: 9,
  },
];
