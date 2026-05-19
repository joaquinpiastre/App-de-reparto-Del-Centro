import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';

import { API_ENABLED, MOBILE_API_KEY } from '@/constants/api';
import { API_URL } from '@/constants/api';

const LOCATION_TASK = 'background-location-task';
const GPS_ACTIVO_KEY = 'gps_activo';
const BATERIA_SOLICITADA_KEY = 'bateria_exencion_solicitada';

export async function mandarPosicionGPS(
  lat: number,
  lng: number,
  velocidad: number,
  precision: number
): Promise<void> {
  const jornadaId = await AsyncStorage.getItem('jornada_id');
  const repartidorId = await AsyncStorage.getItem('repartidor_id');
  const repartidorNombre = await AsyncStorage.getItem('repartidor_nombre');
  if (!jornadaId || !repartidorId || !API_ENABLED) return;

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
      lat,
      lng,
      velocidad,
      precision,
      timestamp: Date.now(),
    }),
  });
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const location = locations[0];
  await mandarPosicionGPS(
    location.coords.latitude,
    location.coords.longitude,
    location.coords.speed ?? 0,
    location.coords.accuracy ?? 0,
  );
});

/**
 * Solicita al usuario que exima la app de la optimización de batería de Android.
 * Solo muestra el diálogo una vez. Sin esta exención, el GPS se pausa cuando
 * la pantalla se apaga en la mayoría de los dispositivos Android.
 */
async function solicitarExencionBateria(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const yaFue = await AsyncStorage.getItem(BATERIA_SOLICITADA_KEY);
    if (yaFue) return;
    await AsyncStorage.setItem(BATERIA_SOLICITADA_KEY, '1');

    await new Promise<void>((resolve) => {
      Alert.alert(
        'GPS con pantalla apagada',
        'Para que la ubicación siga enviándose aunque la pantalla esté apagada, necesitás permitir que la app ignore la optimización de batería.\n\nEn la siguiente pantalla seleccioná "Permitir".',
        [
          {
            text: 'Ahora no',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Configurar',
            onPress: async () => {
              try {
                await IntentLauncher.startActivityAsync(
                  'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
                  { data: 'package:com.delcentro.reparto' }
                );
              } catch {
                // Si el intent falla (algunos fabricantes lo bloquean), ignorar silenciosamente.
              }
              resolve();
            },
          },
        ]
      );
    });
  } catch {
    // No interrumpir el inicio del GPS si esto falla.
  }
}

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

  // Detener si ya estaba corriendo para evitar duplicados
  const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (yaActivo) await Location.stopLocationUpdatesAsync(LOCATION_TASK);

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    // timeInterval es el mínimo entre actualizaciones (ms)
    timeInterval: 5000,
    // distanceInterval: sin distancia mínima → siempre actualiza cada timeInterval
    distanceInterval: 0,
    // Evita que Android agrupe y postergue las actualizaciones (crucial para pantalla apagada)
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: 'Del Centro — GPS Activo',
      notificationBody: 'Rastreando tu ruta de reparto',
      notificationColor: '#6DC921',
      // El servicio no muere aunque el usuario cierre la app desde recientes
      killServiceOnDestroy: false,
    },
  });

  await AsyncStorage.setItem(GPS_ACTIVO_KEY, '1');

  // Solicitar exención de batería (solo la primera vez, después de iniciar el GPS)
  void solicitarExencionBateria();
}

export async function detenerGPS() {
  await AsyncStorage.removeItem(GPS_ACTIVO_KEY);
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

/**
 * Llamar cada vez que la app vuelve al frente.
 * Si el GPS debería estar activo (jornada en curso) pero se detuvo
 * (SO agresivo, proceso matado), lo reinicia automáticamente.
 */
export async function reanudarGPSSiNecesario(): Promise<void> {
  try {
    const debeEstarActivo = await AsyncStorage.getItem(GPS_ACTIVO_KEY);
    if (!debeEstarActivo) return;

    const jornadaId = await AsyncStorage.getItem('jornada_id');
    const repartidorId = await AsyncStorage.getItem('repartidor_id');
    if (!jornadaId || !repartidorId) return;

    const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (yaActivo) return;

    const repartidorNombre = await AsyncStorage.getItem('repartidor_nombre') ?? repartidorId;
    await iniciarGPS(jornadaId, repartidorId, repartidorNombre);
  } catch (e) {
    console.warn('reanudarGPSSiNecesario:', e);
  }
}
