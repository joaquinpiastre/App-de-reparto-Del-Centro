import Constants from 'expo-constants';
import { Platform } from 'react-native';

let handlerListo = false;
let notificationsModule: typeof import('expo-notifications') | null = null;

function esExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

async function getNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (Platform.OS === 'web' || esExpoGo()) return null;
  if (!notificationsModule) {
    notificationsModule = await import('expo-notifications');
  }
  return notificationsModule;
}

export async function inicializarNotificaciones() {
  if (Platform.OS === 'web' || esExpoGo()) {
    return;
  }
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;
    if (!handlerListo) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerListo = true;
    }
    // Desacoplado del primer frame para no interferir con el arranque / splash.
    await new Promise<void>((r) => setTimeout(r, 400));
    await Notifications.requestPermissionsAsync();
  } catch (e) {
    console.warn('Notificaciones (inicio):', e);
  }
}

export async function notificacionLocal(titulo: string, cuerpo: string) {
  if (Platform.OS === 'web') {
    if (typeof globalThis !== 'undefined' && typeof (globalThis as unknown as { alert?: (m: string) => void }).alert === 'function') {
      (globalThis as unknown as { alert: (m: string) => void }).alert(`${titulo}\n${cuerpo}`);
    }
    return;
  }
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: cuerpo },
    trigger: null,
  });
}
