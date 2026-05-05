import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import {
  crearAsignacionesBulk,
  eliminarAsignacion,
  obtenerAsignaciones,
  obtenerClientesCatalogo,
} from '@/services/asignaciones';
import { obtenerRepartidoresDisponibles } from '@/services/adminPedidos';
import type { Asignacion, ClienteCatalogo, Usuario } from '@/types';

const hoy = () => new Date().toISOString().slice(0, 10);
const formatFecha = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function Asignaciones() {
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);
  const [repSeleccionado, setRepSeleccionado] = useState<Usuario | null>(null);
  const [fecha, setFecha] = useState(hoy());
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [catalogo, setCatalogo] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  // IDs de clientes ya asignados al repartidor en esta fecha
  const idsAsignados = new Set(asignaciones.map((a) => a.clienteId));

  const cargarRepartidores = useCallback(async () => {
    try {
      const lista = await obtenerRepartidoresDisponibles();
      setRepartidores(lista);
      if (lista.length > 0 && !repSeleccionado) {
        setRepSeleccionado(lista[0]);
      }
    } catch (e) {
      console.warn('cargarRepartidores:', e);
    }
  }, [repSeleccionado]);

  const cargarAsignaciones = useCallback(async () => {
    if (!repSeleccionado) return;
    setCargando(true);
    try {
      const lista = await obtenerAsignaciones({
        repartidorId: repSeleccionado.id,
        fecha,
      });
      setAsignaciones(lista);
    } catch (e) {
      console.warn('cargarAsignaciones:', e);
    } finally {
      setCargando(false);
    }
  }, [repSeleccionado, fecha]);

  useEffect(() => {
    void cargarRepartidores();
  }, []);

  useEffect(() => {
    void cargarAsignaciones();
  }, [cargarAsignaciones]);

  const abrirModal = async () => {
    setSeleccionados(new Set());
    setBusqueda('');
    if (catalogo.length === 0) {
      try {
        const lista = await obtenerClientesCatalogo();
        setCatalogo(lista);
      } catch (e) {
        console.warn('obtenerClientesCatalogo:', e);
      }
    }
    setModalVisible(true);
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmarAgregado = async () => {
    if (!repSeleccionado || seleccionados.size === 0) return;
    setGuardando(true);
    try {
      await crearAsignacionesBulk(
        repSeleccionado.id,
        [...seleccionados],
        fecha
      );
      setModalVisible(false);
      await cargarAsignaciones();
    } catch (e) {
      console.warn('crearAsignacionesBulk:', e);
    } finally {
      setGuardando(false);
    }
  };

  const quitarAsignacion = async (id: string) => {
    try {
      await eliminarAsignacion(id);
      setAsignaciones((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.warn('eliminarAsignacion:', e);
    }
  };

  const catalogoFiltrado = catalogo.filter((c) => {
    const q = busqueda.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.direccion.toLowerCase().includes(q) ||
      c.tipo.toLowerCase().includes(q)
    );
  });

  return (
    <Screen
      title="Asignaciones"
      subtitle={`Clientes para el ${formatFecha(fecha)}`}
    >
      {/* Selector de repartidor */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Repartidor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {repartidores.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.chip, repSeleccionado?.id === r.id && styles.chipActivo]}
              onPress={() => setRepSeleccionado(r)}
            >
              <Text style={[styles.chipText, repSeleccionado?.id === r.id && styles.chipTextActivo]}>
                {r.nombre}
              </Text>
            </Pressable>
          ))}
          {repartidores.length === 0 && (
            <Text style={styles.empty}>Sin repartidores cargados.</Text>
          )}
        </ScrollView>
      </View>

      {/* Lista de asignaciones del día */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            Clientes asignados ({asignaciones.length})
          </Text>
          {cargando && <ActivityIndicator size="small" color={COLORS.verdePrincipal} />}
        </View>

        {!cargando && asignaciones.length === 0 && (
          <View style={styles.emptyCard}>
            <MaterialIcons name="person-add-alt" size={36} color={COLORS.grisSecundario} />
            <Text style={styles.emptyText}>
              {repSeleccionado
                ? 'No hay clientes asignados para este día.\nUsá el botón de abajo para agregar.'
                : 'Seleccioná un repartidor.'}
            </Text>
          </View>
        )}

        {asignaciones.map((a, idx) => (
          <View key={a.id} style={styles.asigCard}>
            <View style={styles.asigLeft}>
              <View style={styles.asigNumWrap}>
                <Text style={styles.asigNum}>{idx + 1}</Text>
              </View>
              <View style={styles.asigInfo}>
                <View style={styles.asigRow}>
                  <Text style={styles.asigNombre}>{a.cliente.nombre}</Text>
                  <View style={[styles.tipoBadge, a.cliente.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                    <Text style={styles.tipoText}>{a.cliente.tipo}</Text>
                  </View>
                </View>
                <Text style={styles.asigDir}>{a.cliente.direccion}</Text>
                {a.notasAdmin ? (
                  <Text style={styles.asigNota}>{a.notasAdmin}</Text>
                ) : null}
              </View>
            </View>
            <Pressable
              style={styles.removeBtn}
              onPress={() => void quitarAsignacion(a.id)}
            >
              <MaterialIcons name="close" size={18} color={COLORS.error} />
            </Pressable>
          </View>
        ))}
      </View>

      {repSeleccionado && (
        <Button
          label="Agregar clientes"
          onPress={() => void abrirModal()}
          iconLeft={<MaterialIcons name="add" size={18} color="#fff" />}
        />
      )}

      {/* Modal selector de clientes del catálogo */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccioná clientes</Text>
            <Pressable onPress={() => setModalVisible(false)}>
              <MaterialIcons name="close" size={24} color={COLORS.grisTexto} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={20} color={COLORS.grisSecundario} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, dirección o tipo..."
              placeholderTextColor={COLORS.grisSecundario}
              value={busqueda}
              onChangeText={setBusqueda}
              autoFocus
            />
          </View>

          {seleccionados.size > 0 && (
            <Text style={styles.selCount}>{seleccionados.size} seleccionado(s)</Text>
          )}

          <FlatList
            data={catalogoFiltrado}
            keyExtractor={(item) => item.id}
            style={styles.modalList}
            renderItem={({ item }) => {
              const yaAsignado = idsAsignados.has(item.id);
              const estaSeleccionado = seleccionados.has(item.id);
              return (
                <Pressable
                  style={[
                    styles.catalogoCard,
                    estaSeleccionado && styles.catalogoCardSel,
                    yaAsignado && styles.catalogoCardAsignado,
                  ]}
                  onPress={() => !yaAsignado && toggleSeleccion(item.id)}
                  disabled={yaAsignado}
                >
                  <View style={styles.catalogoInfo}>
                    <View style={styles.asigRow}>
                      <Text style={[styles.catalogoNombre, yaAsignado && styles.textDim]}>
                        {item.nombre}
                      </Text>
                      <View style={[styles.tipoBadge, item.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                        <Text style={styles.tipoText}>{item.tipo}</Text>
                      </View>
                    </View>
                    <Text style={[styles.catalogoDir, yaAsignado && styles.textDim]}>
                      {item.direccion}
                    </Text>
                    {yaAsignado && (
                      <Text style={styles.yaAsignadoText}>Ya asignado</Text>
                    )}
                  </View>
                  {!yaAsignado && (
                    <MaterialIcons
                      name={estaSeleccionado ? 'check-circle' : 'radio-button-unchecked'}
                      size={24}
                      color={estaSeleccionado ? COLORS.verdeOscuro : '#ccc'}
                    />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No se encontraron clientes.</Text>
            }
          />

          <View style={styles.modalFooter}>
            <Button
              label={guardando ? 'Guardando...' : `Asignar ${seleccionados.size > 0 ? `(${seleccionados.size})` : ''}`}
              onPress={() => void confirmarAgregado()}
              loading={guardando}
              variant="primary"
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },

  // Chips de repartidores
  chips: { flexGrow: 0 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde3e8',
    marginRight: 8,
  },
  chipActivo: { backgroundColor: COLORS.verdeOscuro, borderColor: COLORS.verdeOscuro },
  chipText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisTexto },
  chipTextActivo: { color: '#fff' },

  // Estado vacío
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e8ecef',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisSecundario,
    textAlign: 'center',
    lineHeight: 20,
  },
  empty: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, padding: 12 },

  // Tarjeta de asignación
  asigCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 10,
  },
  asigLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  asigNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.grisClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  asigNum: { fontFamily: 'Poppins_700Bold', fontSize: 12, color: COLORS.grisTexto },
  asigInfo: { flex: 1, gap: 2 },
  asigRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  asigNombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  asigDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  asigNota: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: COLORS.acentoNaranja,
    fontStyle: 'italic',
  },
  removeBtn: { padding: 6 },

  // Badges
  tipoBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeTaller: { backgroundColor: '#e8f4fd' },
  badgeCliente: { backgroundColor: '#edf7e6' },
  tipoText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: COLORS.grisTexto },

  // Modal
  modal: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 52,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecef',
  },
  modalTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18, color: COLORS.grisTexto },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3e8',
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
  },
  selCount: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.verdeOscuro,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  modalList: { flex: 1 },
  catalogoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8ecef',
    gap: 10,
  },
  catalogoCardSel: {
    borderColor: COLORS.verdeOscuro,
    backgroundColor: '#f0fae8',
  },
  catalogoCardAsignado: {
    opacity: 0.55,
    backgroundColor: '#fafafa',
  },
  catalogoInfo: { flex: 1, gap: 3 },
  catalogoNombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  catalogoDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  yaAsignadoText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: COLORS.grisSecundario },
  textDim: { color: COLORS.grisSecundario },
  modalFooter: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8ecef' },
});
