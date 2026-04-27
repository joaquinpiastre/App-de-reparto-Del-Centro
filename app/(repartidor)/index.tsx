import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { setAuthToken } from '@/services/apiClient';
import { useAppStore } from '@/store/useAppStore';

const TEL_LOCAL = '2604500000';

export default function HomeRepartidor() {
  const {
    jornadaActiva,
    jornadaInicioEpoch,
    iniciarJornada,
    pausarJornada,
    resetSesion,
    usuario,
    clientesDelDia,
    irAlPrimerPendiente,
  } = useAppStore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!jornadaActiva || !jornadaInicioEpoch) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [jornadaActiva, jornadaInicioEpoch]);

  const minutosRuta = useMemo(() => {
    if (!jornadaActiva || !jornadaInicioEpoch) return 0;
    return Math.max(0, Math.floor((Date.now() - jornadaInicioEpoch) / 60000));
  }, [jornadaActiva, jornadaInicioEpoch, tick]);

  const completados = clientesDelDia.filter((c) => c.estado === 'entregado').length;
  const total = clientesDelDia.length;
  const nombre = usuario?.nombre ?? 'Repartidor';

  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove(['jornada_id', 'repartidor_id']);
    await setAuthToken(null);
    resetSesion();
    router.replace('/(auth)/login');
  };

  const irProximaEntrega = () => {
    if (!jornadaActiva) {
      Alert.alert('Turno', 'Iniciá el turno para acceder a las entregas.');
      return;
    }
    irAlPrimerPendiente();
    router.push('/(repartidor)/en-entrega');
  };

  return (
    <Screen title={`¡Buenos días, ${nombre}!`} subtitle="Del Centro Pinturerias · Reparto">
      <View style={styles.card}>
        <Text style={styles.big}>
          {jornadaActiva ? `Clientes hoy: ${total}` : 'Iniciá el turno para cargar la ruta'}
        </Text>
        <Text style={styles.small}>
          {jornadaActiva
            ? `Completados: ${completados} / ${total} · Tiempo en ruta: ${minutosRuta} min`
            : 'El mapa, la ruta y los pedidos en calle se activan con el turno.'}
        </Text>
      </View>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <Button
            label="Ver mi ruta"
            onPress={() => router.push('/(repartidor)/ruta-del-dia')}
            variant="secondary"
            iconLeft={<MaterialIcons name="map" color="#fff" size={16} />}
          />
        </View>
        <View style={styles.gridRow}>
          <Button
            label="Próxima entrega"
            onPress={irProximaEntrega}
            variant="secondary"
            iconLeft={<MaterialIcons name="local-shipping" color="#fff" size={16} />}
          />
        </View>
        <View style={styles.gridRow}>
          <Button
            label="Pedido en la calle (Excel)"
            onPress={() => router.push('/(repartidor)/pedido-calle')}
            variant="secondary"
            iconLeft={<MaterialIcons name="upload-file" color="#fff" size={16} />}
          />
        </View>
        <View style={styles.gridRow}>
          <Button
            label="Mi progreso"
            onPress={() => router.push('/(repartidor)/resumen')}
            variant="secondary"
            iconLeft={<MaterialIcons name="insights" color="#fff" size={16} />}
          />
        </View>
        <View style={styles.gridRow}>
          <Button
            label="Llamar al local"
            onPress={() => Linking.openURL(`tel:${TEL_LOCAL}`)}
            variant="secondary"
            iconLeft={<MaterialIcons name="call" color="#fff" size={16} />}
          />
        </View>
      </View>
      <Button
        label={jornadaActiva ? 'PAUSAR TURNO' : 'INICIAR TURNO'}
        onPress={() => (jornadaActiva ? pausarJornada() : iniciarJornada())}
        variant="primary"
      />
      <Button label="CERRAR SESIÓN" onPress={cerrarSesion} variant="danger" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  big: { fontFamily: 'Poppins_700Bold', fontSize: 22, color: COLORS.grisTexto },
  small: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },
  grid: {},
  gridRow: { marginBottom: 8 },
});
