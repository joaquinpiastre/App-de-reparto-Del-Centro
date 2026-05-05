import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import { setAuthToken } from '@/services/apiClient';
import { obtenerAsignaciones } from '@/services/asignaciones';

const hoy = () => new Date().toISOString().slice(0, 10);

export default function AdminDashboard() {
  const { resetSesion } = useAppStore();
  const pedidos = usePedidosCalleStore((s) => s.pedidos);
  const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length;

  const [totalAsignaciones, setTotalAsignaciones] = useState<number | null>(null);
  const [visitados, setVisitados] = useState<number | null>(null);

  useEffect(() => {
    obtenerAsignaciones({ fecha: hoy() })
      .then((lista) => {
        setTotalAsignaciones(lista.length);
        setVisitados(lista.filter((a) => a.estado === 'entregado').length);
      })
      .catch(() => {});
  }, []);

  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove(['jornada_id', 'repartidor_id']);
    await setAuthToken(null);
    resetSesion();
    router.replace('/(auth)/login');
  };

  return (
    <Screen title="Panel de control" subtitle="Del Centro Pinturerias">

      {/* Card asignaciones de hoy */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="assignment-ind" size={22} color={COLORS.verdeOscuro} />
          <Text style={styles.cardTitle}>Visitas de hoy</Text>
        </View>
        {totalAsignaciones === null ? (
          <Text style={styles.sub}>Cargando...</Text>
        ) : (
          <>
            <Text style={styles.stat}>
              {visitados}/{totalAsignaciones} completadas
            </Text>
            <Text style={styles.sub}>
              {totalAsignaciones === 0
                ? 'Sin clientes asignados por el momento.'
                : `${totalAsignaciones - (visitados ?? 0)} visita(s) pendiente(s).`}
            </Text>
          </>
        )}
        <Button
          label="Ver asignaciones"
          variant="secondary"
          onPress={() => router.push('/(admin)/asignaciones')}
        />
      </View>

      {/* Card pedidos en calle */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="notifications-active" size={22} color={COLORS.acentoNaranja} />
          <Text style={styles.cardTitle}>Pedidos en calle</Text>
        </View>
        <Text style={styles.stat}>{pendientes} pendiente(s)</Text>
        <Text style={styles.sub}>Pedidos levantados por repartidores durante la ruta.</Text>
      </View>

      <Button label="Cerrar sesión" onPress={cerrarSesion} variant="danger" />
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
    borderColor: '#e8ecef',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: COLORS.grisTexto },
  stat: { fontFamily: 'Poppins_800ExtraBold', fontSize: 22, color: COLORS.grisTexto },
  sub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario },
});
