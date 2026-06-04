import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { Stack as ExpoStack, withLayoutContext } from 'expo-router';
import { createStackNavigator } from '@react-navigation/stack';
import { stackRouterOverride } from '@/lib/stackRouterOverride';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { inicializarNotificaciones } from '@/services/notificaciones';
import { restaurarSesionApi } from '@/services/authApi';
import { enviarPosicionActual, reanudarGPSSiNecesario } from '@/services/gps';
import { reintentarSincronizaciones } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';

/**
 * Navegación raíz:
 * - Web: `Stack` de expo-router (native-stack) — el stack JS en RN Web suele dejar escenas sin altura.
 * - Móvil: stack JS para evitar el ClassCast String↔Boolean de native-stack/RN Screens en Expo Go.
 */
const { Navigator: StackNavigator } = createStackNavigator();
/** iOS/Android: stack JS para no mezclar opciones de native-stack con RN Screens (Expo Go). */
const JsStack = withLayoutContext(StackNavigator);
/** Web: el Stack de Expo evita escenas con altura 0 típicas de @react-navigation/stack en RN Web. */
const WebStack = ExpoStack;

export default function RootLayout() {
  const ocultoSplash = useRef(false);
  const [sesionLista, setSesionLista] = useState(false);
  const setUsuario = useAppStore((s) => s.setUsuario);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void inicializarNotificaciones();
  }, []);

  // Cada vez que la app vuelve al frente:
  // 1. Enviar posición inmediata (visible en mapa admin al instante)
  // 2. Reiniciar GPS task (Xiaomi puede haberlo matado con la pantalla apagada)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const alVolver = () => {
      void enviarPosicionActual();        // posición inmediata
      void reanudarGPSSiNecesario();     // reinicio del task de fondo
      void reintentarSincronizaciones(); // reintentar visitas que quedaron sin internet
    };
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') alVolver();
    });
    alVolver(); // también al arrancar la app
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const user = await restaurarSesionApi();
      if (!mounted) return;
      setUsuario(user);

      if (user?.rol === 'repartidor' && Platform.OS !== 'web') {
        // Recuperar jornada activa si el OS mató la app con la pantalla apagada.
        // restaurarJornada limpia viaje_epoch/viaje_index si recupera exitosamente,
        // por lo que la restauración del viaje siguiente solo aplica si no hubo jornada que recuperar.
        await useAppStore.getState().restaurarJornada();

        // Restaurar viaje en curso (solo si restaurarJornada no lo limpió)
        const epochStr = await AsyncStorage.getItem('viaje_epoch');
        const indexStr = await AsyncStorage.getItem('viaje_index');
        if (epochStr && indexStr) {
          useAppStore.setState({
            viajeIniciadoEpoch: Number(epochStr),
            clienteActualIndex: Number(indexStr),
          });
        }
      }

      setSesionLista(true);
    })();
    return () => {
      mounted = false;
    };
  }, [setUsuario]);

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const asegurarSplashOculto = () => {
    if (ocultoSplash.current) return;
    ocultoSplash.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  };

  // No bloqueamos la UI esperando fuentes: en algunos dispositivos useFonts no termina y la app queda “colgada”.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      if (fontError) {
        console.warn('Fuentes Poppins:', fontError);
      }
      asegurarSplashOculto();
    }
  }, [fontsLoaded, fontError]);

  // Red de seguridad: ocultar splash aunque las fuentes sigan cargando (p. ej. primer arranque lento).
  useEffect(() => {
    const t = setTimeout(() => asegurarSplashOculto(), 800);
    return () => clearTimeout(t);
  }, []);

  const RootNav = Platform.OS === 'web' ? WebStack : JsStack;
  const stackExtras =
    Platform.OS !== 'web' && stackRouterOverride ? { UNSTABLE_router: stackRouterOverride } : {};

  if (!sesionLista) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView
        style={Platform.OS === 'web' ? styles.rootWeb : styles.root}
      >
        <StatusBar style="light" />
        <RootNav
        detachInactiveScreens={false}
        initialRouteName="index"
        screenOptions={
          Platform.OS === 'web'
            ? {
                headerShown: false,
                animation: 'none',
                contentStyle: { flex: 1 },
              }
            : { headerShown: false }
        }
        {...stackExtras}
      />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootWeb: { flex: 1, height: '100%', minHeight: '100%', width: '100%' },
});
