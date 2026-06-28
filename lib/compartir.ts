import { Alert, Platform, Share } from 'react-native';

/**
 * Comparte texto plano usando la hoja de compartir nativa (WhatsApp, mail, SMS, etc.).
 * En web usa la Web Share API si el navegador la soporta (Chrome/Safari mobile);
 * si no está disponible, copia el texto al portapapeles como respaldo.
 */
export async function compartirTexto(texto: string, titulo?: string): Promise<void> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: unknown) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: titulo, text: texto });
        return;
      } catch {
        // Usuario canceló el share nativo — no hacer nada más
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      Alert.alert('Copiado', 'Tu navegador no permite compartir directamente. El texto se copió al portapapeles, pegalo donde quieras enviarlo.');
    } catch {
      Alert.alert('No se pudo compartir', 'Copiá el texto manualmente.');
    }
    return;
  }
  try {
    await Share.share({ message: texto, title: titulo });
  } catch {
    Alert.alert('Error', 'No se pudo abrir el menú para compartir.');
  }
}
