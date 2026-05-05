import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function Camara() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [cargando, setCargando] = useState(false);
  const setFoto = useAppStore((s) => s.setFotoPendienteUri);
  const completarVisitaActual = useAppStore((s) => s.completarVisitaActual);

  if (!permiso?.granted) {
    return (
      <Screen title="Foto de confirmación" subtitle="Permisos de cámara">
        <Text style={styles.hint}>Necesitamos acceso a la cámara para la foto del pedido.</Text>
        <Button label="PERMITIR CÁMARA" onPress={() => void pedirPermiso()} />
        <Button label="VOLVER" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const capturar = async () => {
    try {
      setCargando(true);
      const photo = await ref.current?.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
        base64: true,
      });
      if (photo?.uri) {
        const fotoPayload = photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : photo.uri;
        setFoto(fotoPayload);
        completarVisitaActual();
        router.replace('/(repartidor)/ruta-del-dia');
      } else {
        Alert.alert('Cámara', 'No se pudo guardar la foto. Probá de nuevo.');
      }
    } catch {
      Alert.alert('Cámara', 'Error al capturar.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Screen title="Foto de confirmación" subtitle="Fotografiá el pedido entregado">
      <CameraView ref={ref} style={styles.camera} facing="back" mode="picture" />
      <Button label={cargando ? 'GUARDANDO…' : 'CAPTURAR FOTO'} loading={cargando} onPress={() => void capturar()} />
      <Button
        label="Saltar foto"
        variant="secondary"
        onPress={() => {
          completarVisitaActual();
          router.replace('/(repartidor)/ruta-del-dia');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, minHeight: 320, borderRadius: 16, overflow: 'hidden' },
  hint: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginBottom: 12 },
});
