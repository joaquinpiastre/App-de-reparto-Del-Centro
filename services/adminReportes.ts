import { API_ENABLED } from '@/constants/api';
import { apiRequest } from './apiClient';
import { useHistorialStore, type CierreJornadaResumen } from '@/store/useHistorialStore';

export interface StatsResumen {
  jornadas: number;
  entregas: number;
  incidencias: number;
  promedioMinutosRuta: number;
}

export interface StatsSeries {
  labels: string[];
  entregas: number[];
  minutos: number[];
}

export interface TopRepartidorStat {
  id: string;
  nombre: string;
  entregas: number;
}

export interface AdminStatsResponse {
  resumen: StatsResumen;
  series: StatsSeries;
  topRepartidores: TopRepartidorStat[];
}

export interface RecorridoPoint {
  lat: number;
  lng: number;
  timestamp: number;
  velocidad: number | null;
}

export interface RecorridoStop {
  lat: number;
  lng: number;
  inicio: number;
  fin: number;
  duracionSegundos: number;
}

export interface RecorridoJornadaResponse {
  jornadaId: string;
  repartidorId: string;
  points: RecorridoPoint[];
  stops: RecorridoStop[];
}

function localStats(cierres: CierreJornadaResumen[]): AdminStatsResponse {
  const slice = cierres.slice(0, 6).reverse();
  const jornadas = cierres.length;
  const entregas = cierres.reduce((acc, c) => acc + c.completados, 0);
  const promedioMinutosRuta =
    cierres.length > 0
      ? Math.round(cierres.reduce((acc, c) => acc + c.minutosEnRuta, 0) / cierres.length)
      : 0;
  return {
    resumen: {
      jornadas,
      entregas,
      incidencias: 0,
      promedioMinutosRuta,
    },
    series: {
      labels: slice.map((_c, i) => String(i + 1)),
      entregas: slice.map((c) => c.completados),
      minutos: slice.map((c) => c.minutosEnRuta),
    },
    topRepartidores: [],
  };
}

export async function obtenerHistorialAdmin(): Promise<CierreJornadaResumen[]> {
  if (!API_ENABLED) {
    return useHistorialStore.getState().cierres;
  }
  const data = await apiRequest<{ historial: CierreJornadaResumen[] }>('/admin-reportes/historial');
  return data.historial;
}

export async function obtenerStatsAdmin(): Promise<AdminStatsResponse> {
  if (!API_ENABLED) {
    return localStats(useHistorialStore.getState().cierres);
  }
  return apiRequest<AdminStatsResponse>('/admin-reportes/stats');
}

export async function obtenerRecorridoJornadaAdmin(
  jornadaId: string
): Promise<RecorridoJornadaResponse | null> {
  if (!API_ENABLED) return null;
  return apiRequest<RecorridoJornadaResponse>(`/gps/jornadas/${jornadaId}/recorrido`);
}
