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

function presenciaJornadaId(repartidorId: string): string {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `pres-${repartidorId}-${fecha}`;
}

export async function mandarPosicionGPS(
  lat: number,
  lng: number,
  velocidad: number,
  precision: number
): Promise<void> {
  const repartidorId = await AsyncStorage.getItem('repartidor_id');
  if (!repartidorId || !API_ENABLED) return;
  const repartidorNombre = await AsyncStorage.getItem('repartidor_nombre');
  // Si no hay jornada real activa, usar jornada de presencia del día
  let jornadaId = await AsyncStorage.getItem('jornada_id');
  if (!jornadaId) {
    jornadaId = presenciaJornadaId(repartidorId);
    await AsyncStorage.setItem('jornada_id', jornadaId);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (MOBILE_API_KEY) {
    headers.Authorization = `Bearer ${MOBILE_API_KEY}`;
  } else {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(`${API_URL}/gps/update`, {
      method: 'POST',
      headers,
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
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

async function arrancarLocationTask(notificationBody: string): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 0,
    deferredUpdatesInterval: 0,
    deferredUpdatesDistance: 0,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: 'Del Centro — GPS Activo',
      notificationBody,
      notificationColor: '#6DC921',
      killServiceOnDestroy: false,
    },
  });
  await AsyncStorage.setItem(GPS_ACTIVO_KEY, '1');
}

/**
 * Inicia GPS en modo jornada real.
 * Si el GPS ya estaba corriendo en modo presencia, solo actualiza el jornadaId.
 */
export async function iniciarGPS(jornadaId: string, repartidorId: string, repartidorNombre?: string) {
  await AsyncStorage.setItem('jornada_id', jornadaId);
  await AsyncStorage.setItem('repartidor_id', repartidorId);
  if (repartidorNombre) {
    await AsyncStorage.setItem('repartidor_nombre', repartidorNombre);
  }

  // Si ya está corriendo (modo presencia), solo cambia el jornadaId — no es necesario reiniciar
  const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (yaActivo) {
    await AsyncStorage.setItem(GPS_ACTIVO_KEY, '1');
    return;
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted' || bg.status !== 'granted') {
    throw new Error('Permiso de GPS denegado');
  }

  await arrancarLocationTask('Rastreando tu ruta de reparto');
  void solicitarExencionBateria();
}

/**
 * Inicia GPS en modo presencia (sin jornada real activa).
 * Se llama al iniciar sesión para que el admin pueda ver dónde está el repartidor.
 * No lanza error si los permisos no están: falla silenciosamente.
 */
export async function iniciarGPSPresencia(repartidorId: string, repartidorNombre: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await AsyncStorage.setItem('repartidor_id', repartidorId);
    await AsyncStorage.setItem('repartidor_nombre', repartidorNombre);

    // Solo establecer presencia si no hay una jornada real activa
    const jornadaActual = await AsyncStorage.getItem('jornada_id');
    if (!jornadaActual || jornadaActual.startsWith('pres-')) {
      await AsyncStorage.setItem('jornada_id', presenciaJornadaId(repartidorId));
    }

    // Si GPS ya está corriendo, simplemente seguimos usando el mismo task
    const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (yaActivo) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return;

    await arrancarLocationTask('Seguimiento de ubicación activo');
    void solicitarExencionBateria();
  } catch (e) {
    console.warn('iniciarGPSPresencia:', e);
  }
}

/**
 * Detiene el GPS completamente (logout) o revierte al modo presencia (fin de jornada).
 * @param revertirAPresencia Si true, el GPS sigue corriendo pero con jornadaId de presencia.
 */
export async function detenerGPS(revertirAPresencia = false) {
  if (revertirAPresencia) {
    const repartidorId = await AsyncStorage.getItem('repartidor_id');
    if (repartidorId) {
      await AsyncStorage.setItem('jornada_id', presenciaJornadaId(repartidorId));
    }
    // El task sigue corriendo — GPS_ACTIVO_KEY se mantiene
    return;
  }
  // Parada completa (logout)
  await AsyncStorage.removeItem(GPS_ACTIVO_KEY);
  await AsyncStorage.removeItem('jornada_id');
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

/**
 * Envía la última posición conocida inmediatamente (sin esperar el task de fondo).
 * Se llama cuando la app vuelve al frente para garantizar visibilidad instantánea.
 */
export async function enviarPosicionActual(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const repartidorId = await AsyncStorage.getItem('repartidor_id');
    if (!repartidorId || !API_ENABLED) return;
    const loc = await Location.getLastKnownPositionAsync({});
    if (!loc) return;
    await mandarPosicionGPS(
      loc.coords.latitude,
      loc.coords.longitude,
      loc.coords.speed ?? 0,
      loc.coords.accuracy ?? 0,
    );
  } catch {
    // silencioso — no interrumpir flujo de UI
  }
}

/**
 * Llamar cada vez que la app vuelve al frente.
 * En Xiaomi y Android agresivos, el task puede estar "registrado" pero muerto.
 * Por eso siempre forzamos stop+start para asegurar que esté corriendo de verdad.
 */
export async function reanudarGPSSiNecesario(): Promise<void> {
  try {
    const debeEstarActivo = await AsyncStorage.getItem(GPS_ACTIVO_KEY);
    if (!debeEstarActivo) return;

    const jornadaId = await AsyncStorage.getItem('jornada_id');
    const repartidorId = await AsyncStorage.getItem('repartidor_id');
    if (!jornadaId || !repartidorId) return;

    // Siempre parar y reiniciar — en Xiaomi el task puede estar "activo" pero sin enviar
    const yaActivo = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (yaActivo) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }

    const repartidorNombre = await AsyncStorage.getItem('repartidor_nombre') ?? repartidorId;
    await iniciarGPS(jornadaId, repartidorId, repartidorNombre);
  } catch (e) {
    console.warn('reanudarGPSSiNecesario:', e);
  }
}
