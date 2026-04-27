import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { CLIENTES_DEMO_SEED } from '@/constants/demoData';
import { useAppStore } from '@/store/useAppStore';
import { useAdminPedidosStore } from '@/store/useAdminPedidosStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import { setAuthToken } from '@/services/apiClient';

export default function AdminDashboard() {
  const { resetSesion } = useAppStore();
  const pedidos = usePedidosCalleStore((s) => s.pedidos);
  const pedidosAdmin = useAdminPedidosStore((s) => s.pedidos);
  const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length;
  const adminActivos = pedidosAdmin.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado').length;

  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove(['jornada_id', 'repartidor_id']);
    await setAuthToken(null);
    resetSesion();
    router.replace('/(auth)/login');
  };

  return (
    <Screen title="Panel de control" subtitle="Del Centro Pinturerias">
      <View style={styles.card}>
        <Text style={styles.t}>Pedidos admin activos: {adminActivos}</Text>
        <Text style={styles.s}>Crealos y asignalos desde la pestaña «Pedidos».</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.t}>Pedidos en calle pendientes: {pendientes}</Text>
        <Text style={styles.s}>Pedidos levantados por repartidores durante la ruta.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.t}>Clientes en catálogo demo: {CLIENTES_DEMO_SEED.length}</Text>
        <Text style={styles.s}>En producción enlazá esta vista a Firestore `clientes`.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.t}>Entregas demo del día</Text>
        <Text style={styles.s}>Usá la app repartidor con turno iniciado para simular rutas reales.</Text>
      </View>
      <Button label="CERRAR SESIÓN" onPress={cerrarSesion} variant="danger" />
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 },
  t: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  s: { fontFamily: 'Poppins_400Regular', color: '#666', marginTop: 4 },
});
