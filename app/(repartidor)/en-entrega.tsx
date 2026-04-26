import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { TimerEntrega } from '@/components/entrega/TimerEntrega';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useTimer } from '@/hooks/useTimer';
import { useAppStore } from '@/store/useAppStore';

export default function EnEntrega() {
  const {
    clientesDelDia,
    clienteActualIndex,
    jornadaActiva,
    marcarClienteEstado,
    reportarProblemaActual,
    setEntregaTimerSegundos,
  } = useAppStore();
  const cliente = clientesDelDia[clienteActualIndex];
  const timerActivo = jornadaActiva && !!cliente && cliente.estado !== 'entregado';
  const segundos = useTimer(!!timerActivo && cliente?.estado === 'en_camino');

  useFocusEffect(
    useCallback(() => {
      if (cliente?.estado === 'pendiente') {
        marcarClienteEstado(cliente.id, 'en_camino');
      }
    }, [cliente?.id, cliente?.estado, marcarClienteEstado])
  );

  if (!jornadaActiva || !cliente) {
    return (
      <Screen title="Entrega activa" subtitle="Sin cliente seleccionado">
        <Text style={styles.body}>Iniciá el turno y elegí una entrega desde la ruta o Inicio.</Text>
        <Button label="Volver" onPress={() => router.back()} />
      </Screen>
    );
  }

  const llamar = () => {
    const tel = cliente.telefono.replace(/\s/g, '');
    Linking.openURL(`tel:${tel}`);
  };

  return (
    <Screen title="Entrega activa" subtitle={`Cliente: ${cliente.nombre}`}>
      <View style={styles.card}>
        <Text style={styles.name}>{cliente.nombre}</Text>
        <Text style={styles.body}>{cliente.direccion}</Text>
        <Text style={styles.body}>{cliente.pedido}</Text>
      </View>
      <View style={styles.timer}>
        <Text style={styles.timerLabel}>Tiempo en parada</Text>
        <TimerEntrega segundos={cliente.estado === 'en_camino' ? segundos : 0} />
      </View>
      <Button
        label="REGISTRAR ENTREGA"
        onPress={() => {
          setEntregaTimerSegundos(cliente.estado === 'en_camino' ? segundos : 0);
          router.push('/(repartidor)/camara');
        }}
      />
      <Button label="Llamar al cliente" variant="warning" onPress={llamar} />
      <Button
        label="Reportar problema"
        variant="danger"
        onPress={() => {
          Alert.alert('Problema en la entrega', '¿Marcar esta parada con incidencia?', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Confirmar',
              onPress: () => {
                reportarProblemaActual();
                router.replace('/(repartidor)/ruta-del-dia');
              },
            },
          ]);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  name: { fontFamily: 'Poppins_800ExtraBold', fontSize: 22 },
  body: { fontFamily: 'Poppins_400Regular' },
  timer: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center' },
  timerLabel: { fontFamily: 'Poppins_600SemiBold' },
});
