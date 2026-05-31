import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { RutaTrazada } from '@/components/mapa/RutaTrazada';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import type { Cliente } from '@/types';

function abrirNavegacion(c: Cliente) {
  const dest = c.direccion?.trim();
  if (dest) {
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`
    );
    return;
  }
  void Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${c.coordenadas.lat},${c.coordenadas.lng}&travelmode=driving`
  );
}

function abrirRutaCompleta(clientes: Cliente[], origen?: { lat: number; lng: number } | null) {
  const paradas = clientes
    .filter((c) => c.estado !== 'entregado' && c.estado !== 'problema')
    .map((c) => encodeURIComponent(c.direccion))
    .filter(Boolean);
  if (paradas.length === 0) return;
  const dest = paradas.pop();
  const waypoints = paradas.join('|');
  let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  if (origen) url += `&origin=${origen.lat},${origen.lng}`;
  void Linking.openURL(url);
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_camino: 'En camino',
  entregado: 'Visitado',
  problema: 'Problema',
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: COLORS.grisSecundario,
  en_camino: COLORS.acentoAzul,
  entregado: COLORS.exito,
  problema: COLORS.error,
};

export default function RutaDelDia() {
  const {
    clientesDelDia,
    clienteActualIndex,
    jornadaActiva,
    ultimaPosicion,
  } = useAppStore();

  if (!jornadaActiva || clientesDelDia.length === 0) {
    return (
      <Screen title="Mi recorrido de hoy" subtitle="Ruta optimizada">
        <View style={styles.aviso}>
          <MaterialIcons name="route" size={40} color={COLORS.grisSecundario} />
          <Text style={styles.avisoTexto}>
            Iniciá el turno desde Inicio para cargar tus clientes del día.
          </Text>
          <Button label="Ir a inicio" onPress={() => router.replace('/(repartidor)')} />
        </View>
      </Screen>
    );
  }

  const [busqueda, setBusqueda] = useState('');
  const actual = clientesDelDia[clienteActualIndex];
  const pendientes = clientesDelDia.filter(
    (c) => c.estado === 'pendiente' || c.estado === 'en_camino'
  ).length;

  const clientesFiltrados = busqueda.trim()
    ? clientesDelDia.filter(
        (c) =>
          c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          c.direccion.toLowerCase().includes(busqueda.toLowerCase())
      )
    : clientesDelDia;

  return (
    <Screen
      title="Mi recorrido de hoy"
      subtitle={`${clientesDelDia.length - pendientes} / ${clientesDelDia.length} visitados`}
      showBack
      showHome
      scrollable
    >
      <RutaTrazada clientes={clientesDelDia} destacarClienteId={actual?.id} />

      <Button
        label="ABRIR RUTA EN GOOGLE MAPS"
        onPress={() => abrirRutaCompleta(clientesDelDia, ultimaPosicion)}
        iconLeft={<MaterialIcons name="directions" size={16} color="#fff" />}
      />

      {/* Buscador de clientes */}
      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={18} color={COLORS.grisSecundario} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente o dirección…"
          placeholderTextColor={COLORS.grisSecundario}
          value={busqueda}
          onChangeText={setBusqueda}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {clientesFiltrados.map((item) => {
        const index = clientesDelDia.indexOf(item);
        return (
          <View key={item.id} style={[styles.card, item.id === actual?.id && styles.cardActual]}>
            <View style={styles.cardTop}>
              <View style={styles.cardLeft}>
                <Text style={styles.num}>{index + 1}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                <View style={styles.row}>
                  <MaterialIcons name="location-on" size={12} color={COLORS.grisSecundario} />
                  <Text style={styles.detalle}>{item.direccion}</Text>
                </View>
                {item.pedido && item.pedido !== 'Cliente' && item.pedido !== 'Taller' ? (
                  <Text style={styles.nota}>{item.pedido}</Text>
                ) : null}
              </View>
              <View style={[styles.estadoBadge, { backgroundColor: `${ESTADO_COLOR[item.estado]}18` }]}>
                <Text style={[styles.estadoText, { color: ESTADO_COLOR[item.estado] }]}>
                  {ESTADO_LABEL[item.estado] ?? item.estado}
                </Text>
              </View>
            </View>
            {item.estado !== 'entregado' && item.estado !== 'problema' ? (
              <View style={styles.rowBtns}>
                <Button label="NAVEGAR" onPress={() => abrirNavegacion(item)} />
                <Button
                  label="VISITAR"
                  variant="secondary"
                  onPress={() => {
                    useAppStore.setState({ clienteActualIndex: index });
                    router.push('/(repartidor)/en-entrega');
                  }}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  aviso: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e8ecef',
  },
  avisoTexto: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisTexto,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 8,
  },
  cardActual: {
    borderColor: COLORS.verdePrincipal,
    borderWidth: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardLeft: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.grisClaro,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardInfo: { flex: 1, gap: 3 },
  num: { fontFamily: 'Poppins_700Bold', fontSize: 12, color: COLORS.grisTexto },
  nombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  detalle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisSecundario,
    flex: 1,
    lineHeight: 16,
  },
  nota: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: COLORS.acentoNaranja,
    fontStyle: 'italic',
  },
  estadoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  estadoText: { fontFamily: 'Poppins_700Bold', fontSize: 10 },
  rowBtns: { flexDirection: 'row', gap: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e6ea',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
  },
});
