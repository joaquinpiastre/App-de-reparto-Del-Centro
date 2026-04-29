import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { API_ENABLED, MOBILE_API_KEY } from '@/constants/api';
import { API_URL } from '@/constants/api';

const LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const location = locations[0];

  const jornadaId = await AsyncStorage.getItem('jornada_id');
  const repartidorId = await AsyncStorage.getItem('repartidor_id');
  const repartidorNombre = await AsyncStorage.getItem('repartidor_nombre');
  if (!jornadaId || !repartidorId) return;

  if (!API_ENABLED) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (MOBILE_API_KEY) {
    headers.Authorization = `Bearer ${MOBILE_API_KEY}`;
  } else {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  await fetch(`${API_URL}/gps/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jornadaId,
      repartidorId,
      nombre: repartidorNombre ?? repartidorId,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      velocidad: location.coords.speed ?? 0,
      precision: location.coords.accuracy ?? 0,
      timestamp: Date.now(),
    }),
  });
});

export async function iniciarGPS(jornadaId: string, repartidorId: string, repartidorNombre?: string) {
  await AsyncStorage.setItem('jornada_id', jornadaId);
  await AsyncStorage.setItem('repartidor_id', repartidorId);
  if (repartidorNombre) {
    await AsyncStorage.setItem('repartidor_nombre', repartidorNombre);
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted' || bg.status !== 'granted') {
    throw new Error('Permiso de GPS denegado');
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // Mayor frecuencia para seguimiento en tiempo real desde admin.
    distanceInterval: 10,
    timeInterval: 5000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Del Centro - GPS Activo',
      notificationBody: 'Seguimiento de ruta en curso',
      notificationColor: '#6DC921',
    },
  });
}

export async function detenerGPS() {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
