import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { setAuthToken } from '@/services/apiClient';

export default function LogisticaCuentaScreen() {
  const usuario = useAppStore((s) => s.usuario);
  const resetSesion = useAppStore((s) => s.resetSesion);

  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove(['jornada_id', 'repartidor_id']);
    await setAuthToken(null);
    resetSesion();
    router.replace('/(auth)/login');
  };

  return (
    <Screen title="Mi cuenta" subtitle="Sesión de Logística">
      <View style={styles.card}>
        <Text style={styles.nombre}>{usuario?.nombre ?? 'Logística'}</Text>
        <Text style={styles.detalle}>Rol: Logística (solo lectura)</Text>
      </View>
      <Button label="Cerrar sesión" onPress={() => void cerrarSesion()} variant="danger" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  nombre: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: COLORS.grisTexto },
  detalle: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },
});
