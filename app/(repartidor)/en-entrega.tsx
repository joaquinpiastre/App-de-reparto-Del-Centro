import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { TimerEntrega } from '@/components/entrega/TimerEntrega';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useTimer } from '@/hooks/useTimer';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function EnEntrega() {
  const {
    clientesDelDia,
    clienteActualIndex,
    jornadaActiva,
    marcarClienteEstado,
    completarVisitaActual,
    reportarProblemaActual,
    setEntregaTimerSegundos,
  } = useAppStore();
  const cliente = clientesDelDia[clienteActualIndex];
  const timerActivo = jornadaActiva && !!cliente && cliente.estado === 'en_camino';
  const segundos = useTimer(timerActivo);
  const [notas, setNotas] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (cliente?.estado === 'pendiente') {
        marcarClienteEstado(cliente.id, 'en_camino');
      }
      // Limpiar notas al cambiar de cliente
      setNotas('');
    }, [cliente?.id, cliente?.estado, marcarClienteEstado])
  );

  if (!jornadaActiva || !cliente) {
    return (
      <Screen title="Visita activa" subtitle="Sin cliente seleccionado">
        <Text style={styles.body}>Iniciá el turno y elegí un cliente desde la ruta.</Text>
        <Button label="Volver" onPress={() => router.back()} />
      </Screen>
    );
  }

  const llamar = () => {
    const tel = cliente.telefono.replace(/\s/g, '');
    Linking.openURL(`tel:${tel}`);
  };

  const confirmarVisita = () => {
    setEntregaTimerSegundos(timerActivo ? segundos : 0);
    completarVisitaActual({ notasRepartidor: notas.trim() || undefined });
    router.replace('/(repartidor)/ruta-del-dia');
  };

  const confirmarProblema = () => {
    Alert.alert(
      'Problema en la visita',
      '¿Marcar esta parada con incidencia?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: () => {
            reportarProblemaActual(notas.trim() || undefined);
            router.replace('/(repartidor)/ruta-del-dia');
          },
        },
      ]
    );
  };

  const esTaller = cliente.pedido?.toLowerCase() === 'taller' || cliente.pedido?.toLowerCase().includes('taller');

  return (
    <Screen
      title="Visita activa"
      subtitle={`${esTaller ? 'Taller' : 'Cliente'}: ${cliente.nombre}`}
      showBack
    >
      {/* Datos del cliente */}
      <View style={styles.card}>
        <Text style={styles.name}>{cliente.nombre}</Text>
        <View style={styles.row}>
          <MaterialIcons name="location-on" size={14} color={COLORS.grisSecundario} />
          <Text style={styles.detail}>{cliente.direccion}</Text>
        </View>
        {cliente.pedido && cliente.pedido !== 'Cliente' && cliente.pedido !== 'Taller' ? (
          <View style={styles.row}>
            <MaterialIcons name="notes" size={14} color={COLORS.grisSecundario} />
            <Text style={styles.detail}>{cliente.pedido}</Text>
          </View>
        ) : null}
      </View>

      {/* Timer */}
      <View style={styles.timerCard}>
        <Text style={styles.timerLabel}>Tiempo en parada</Text>
        <TimerEntrega segundos={timerActivo ? segundos : 0} />
      </View>

      {/* Notas opcionales */}
      <View style={styles.notasCard}>
        <Text style={styles.notasLabel}>Notas (opcional)</Text>
        <TextInput
          style={styles.notasInput}
          placeholder="Ej: sin novedad, cerrado, reprogramar..."
          placeholderTextColor={COLORS.grisSecundario}
          value={notas}
          onChangeText={setNotas}
          multiline
          maxLength={200}
        />
      </View>

      <Button
        label="MARCAR COMO VISITADO"
        onPress={confirmarVisita}
        variant="primary"
        iconLeft={<MaterialIcons name="check-circle" size={18} color="#fff" />}
      />
      <Button
        label="Llamar al cliente"
        variant="warning"
        onPress={llamar}
        iconLeft={<MaterialIcons name="call" size={16} color="#fff" />}
      />
      <Button
        label="Reportar problema"
        variant="danger"
        onPress={confirmarProblema}
      />
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
  name: { fontFamily: 'Poppins_800ExtraBold', fontSize: 20, color: COLORS.grisTexto },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  detail: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
    flex: 1,
    lineHeight: 18,
  },
  timerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 4,
  },
  timerLabel: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
  notasCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 6,
  },
  notasLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisTexto },
  notasInput: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisTexto,
    minHeight: 56,
    textAlignVertical: 'top',
    paddingTop: 4,
  },
  body: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },
});
