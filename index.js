/**
 * Punto de entrada antes de Expo Router.
 *
 * enableScreens(false) solo en Android/iOS: evita ClassCast en RN Screens con el stack JS.
 * En web no aplica y puede interferir con el panel administrador en el navegador.
 */
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

if (Platform.OS !== 'web') {
  enableScreens(false);
}

require('expo-router/entry');
