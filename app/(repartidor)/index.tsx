import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { setAuthToken } from '@/services/apiClient';
import { obtenerAsignaciones } from '@/services/asignaciones';
import { useAppStore } from '@/store/useAppStore';

const TEL_EMERGENCIA = '2604638122';

export default function HomeRepartidor() {
  const {
    jornadaActiva,
    jornadaInicioEpoch,
    iniciarJornada,
    pausarJornada,
    cerrarJornada,
    resetSesion,
    usuario,
    clientesDelDia,
    irAlPrimerPendiente,
  } = useAppStore();
  const [tick, setTick] = useState(0);
  const [pendientesHoy, setPendientesHoy] = useState<number | null>(null);
  const cerrando = useRef(false);

  useEffect(() => {
    if (!jornadaActiva || !jornadaInicioEpoch) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [jornadaActiva, jornadaInicioEpoch]);

  useEffect(() => {
    if (jornadaActiva || !usuario?.id) return;
    obtenerAsignaciones({ repartidorId: usuario.id })
      .then((asigs) => {
        const n = asigs.filter((a) => a.estado === 'pendiente' || a.estado === 'en_camino').length;
        setPendientesHoy(n);
      })
      .catch(() => setPendientesHoy(null));
  }, [jornadaActiva, usuario?.id]);

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

  const terminarTurno = () => {
    if (!jornadaActiva) {
      Alert.alert('Sin turno activo', 'Iniciá un turno primero para poder terminarlo.');
      return;
    }
    Alert.alert(
      'Terminar turno',
      '¿Guardar y finalizar la jornada? Se guardará todo en el historial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Terminar',
          onPress: () => {
            if (cerrando.current) return;
            cerrando.current = true;
            void cerrarJornada().finally(() => {
              cerrando.current = false;
              // Forzar re-render explícito para evitar pantalla en blanco
              router.replace('/(repartidor)');
            });
          },
        },
      ]
    );
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
    <Screen title={`Hola, ${nombre}`} subtitle="Del Centro Pinturerias · Reparto" scrollable>

      {/* Tarjeta de estado del turno */}
      <View style={[styles.statusCard, jornadaActiva ? styles.statusActivo : styles.statusPausado]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, jornadaActiva ? styles.dotActivo : styles.dotPausado]} />
          <Text style={[styles.statusLabel, jornadaActiva ? styles.textBlanco : styles.textGris]}>
            {jornadaActiva ? 'Turno activo' : 'Turno no iniciado'}
          </Text>
        </View>
        {jornadaActiva ? (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{completados}</Text>
              <Text style={styles.statSub}>Entregados</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{total}</Text>
              <Text style={styles.statSub}>Total</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{minutosRuta}</Text>
              <Text style={styles.statSub}>Min en ruta</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.statusHint}>
            {pendientesHoy != null && pendientesHoy > 0
              ? `Tenés ${pendientesHoy} cliente(s) asignados para hoy. Iniciá el turno para comenzar.`
              : pendientesHoy === 0
                ? 'No tenés clientes asignados hoy. Pedile al admin que aplique tu ruta.'
                : 'Iniciá el turno para cargar la ruta del día.'}
          </Text>
        )}
      </View>

      {/* Botón principal INICIAR / PAUSAR */}
      <Button
        label={jornadaActiva ? 'PAUSAR TURNO' : 'INICIAR TURNO'}
        onPress={() => (jornadaActiva ? pausarJornada() : iniciarJornada())}
        variant={jornadaActiva ? 'warning' : 'primary'}
      />

      {/* Grilla de acciones rápidas */}
      <View style={styles.grid}>
        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
          onPress={() => router.push('/(repartidor)/ruta-del-dia')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#e8f4fd' }]}>
            <MaterialIcons name="map" size={26} color={COLORS.acentoAzul} />
          </View>
          <Text style={styles.actionLabel}>Mi ruta</Text>
          <Text style={styles.actionSub}>Ver el recorrido del día</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
          onPress={irProximaEntrega}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#edf7e6' }]}>
            <MaterialIcons name="local-shipping" size={26} color={COLORS.verdeOscuro} />
          </View>
          <Text style={styles.actionLabel}>Próxima entrega</Text>
          <Text style={styles.actionSub}>Ir al siguiente cliente</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
          onPress={() => router.push('/(repartidor)/pedido-calle')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#fff4ec' }]}>
            <MaterialIcons name="upload-file" size={26} color={COLORS.acentoNaranja} />
          </View>
          <Text style={styles.actionLabel}>Pedido en calle</Text>
          <Text style={styles.actionSub}>Cargar desde Excel</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
          onPress={() => router.push('/(repartidor)/clientes')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#fff0f0' }]}>
            <MaterialIcons name="groups" size={26} color="#e53935" />
          </View>
          <Text style={styles.actionLabel}>Clientes</Text>
          <Text style={styles.actionSub}>Ver y editar clientes</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
          onPress={() => router.push('/(repartidor)/resumen')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#f0eeff' }]}>
            <MaterialIcons name="insights" size={26} color="#7c4dff" />
          </View>
          <Text style={styles.actionLabel}>Resumen</Text>
          <Text style={styles.actionSub}>Ver tu progreso del día</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
          onPress={() => Linking.openURL(`tel:${TEL_EMERGENCIA}`)}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#fff0f0' }]}>
            <MaterialIcons name="phone" size={26} color="#e53935" />
          </View>
          <Text style={styles.actionLabel}>Emergencias</Text>
          <Text style={styles.actionSub}>{TEL_EMERGENCIA}</Text>
        </Pressable>
      </View>

      {/* Terminar turno y cerrar sesión */}
      <View style={styles.rowBottom}>
        <View style={styles.rowBottomBtn}>
          <Button
            label="TERMINAR TURNO"
            variant="warning"
            onPress={terminarTurno}
          />
        </View>
        <View style={styles.rowBottomBtn}>
          <Button label="CERRAR SESIÓN" onPress={cerrarSesion} variant="danger" />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Tarjeta de estado
  statusCard: {
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  statusActivo: {
    backgroundColor: COLORS.verdeOscuro,
  },
  statusPausado: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8ed',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActivo: { backgroundColor: '#a8f07a' },
  dotPausado: { backgroundColor: '#c0c8d0' },
  statusLabel: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
  },
  textBlanco: { color: '#fff' },
  textGris: { color: COLORS.grisTexto },
  statusHint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: 26,
    color: '#fff',
    lineHeight: 30,
  },
  statSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  statSep: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  // Grilla de acciones
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: '47.5%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: COLORS.grisTexto,
  },
  actionSub: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: COLORS.grisSecundario,
    lineHeight: 15,
  },
  rowBottom: {
    flexDirection: 'row',
    gap: 10,
  },
  rowBottomBtn: {
    flex: 1,
  },
});
