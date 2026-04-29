import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import {
  actualizarClienteAdmin,
  crearClienteAdmin,
  eliminarClienteAdmin,
  listarClientesAdmin,
  type ClienteAdminCatalogo,
} from '@/services/adminClientes';

export default function Clientes() {
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState<ClienteAdminCatalogo[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pedido, setPedido] = useState('');

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await listarClientesAdmin();
      setClientes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const data = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(s) ||
        c.direccion.toLowerCase().includes(s) ||
        c.telefono.includes(s)
    );
  }, [q, clientes]);

  const resetForm = () => {
    setEditingId(null);
    setNombre('');
    setDireccion('');
    setTelefono('');
    setPedido('');
    setShowForm(false);
  };

  const guardarCliente = async () => {
    const payload = {
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      telefono: telefono.trim(),
      pedido: pedido.trim(),
    };
    if (!payload.nombre || !payload.direccion || !payload.telefono || !payload.pedido) {
      setError('Completá nombre, dirección, teléfono y pedido típico.');
      return;
    }
    try {
      setGuardando(true);
      setError(null);
      setOk(null);
      if (editingId) {
        await actualizarClienteAdmin(editingId, payload);
        setOk('Cliente actualizado correctamente.');
      } else {
        await crearClienteAdmin(payload);
        setOk('Cliente agregado correctamente.');
      }
      resetForm();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cliente.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (cliente: ClienteAdminCatalogo) => {
    Alert.alert('Eliminar cliente', `¿Eliminar a ${cliente.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setGuardando(true);
              setError(null);
              await eliminarClienteAdmin(cliente.id);
              setOk('Cliente eliminado.');
              await cargar();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se pudo eliminar el cliente.');
            } finally {
              setGuardando(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Screen title="Gestión de clientes" subtitle="Catálogo de clientes + alta desde admin">
      {error ? (
        <View style={[styles.feedback, styles.feedbackError]}>
          <Text style={styles.feedbackText}>{error}</Text>
        </View>
      ) : null}
      {ok ? (
        <View style={[styles.feedback, styles.feedbackOk]}>
          <Text style={styles.feedbackText}>{ok}</Text>
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Buscar por nombre, dirección o teléfono"
        placeholderTextColor={COLORS.grisSecundario}
        value={q}
        onChangeText={setQ}
      />
      {showForm ? (
        <View style={styles.card}>
          <Text style={styles.title}>{editingId ? 'Editar cliente' : 'Nuevo cliente'}</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre"
            placeholderTextColor={COLORS.grisSecundario}
            value={nombre}
            onChangeText={setNombre}
          />
          <TextInput
            style={styles.input}
            placeholder="Dirección"
            placeholderTextColor={COLORS.grisSecundario}
            value={direccion}
            onChangeText={setDireccion}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono"
            placeholderTextColor={COLORS.grisSecundario}
            value={telefono}
            onChangeText={setTelefono}
          />
          <TextInput
            style={styles.input}
            placeholder="Pedido típico"
            placeholderTextColor={COLORS.grisSecundario}
            value={pedido}
            onChangeText={setPedido}
          />
          <View style={styles.actions}>
            <Button
              label={guardando ? 'GUARDANDO…' : editingId ? 'GUARDAR CAMBIOS' : 'GUARDAR CLIENTE'}
              loading={guardando}
              onPress={() => void guardarCliente()}
            />
            <Button
              label="CANCELAR"
              variant="secondary"
              onPress={resetForm}
            />
          </View>
        </View>
      ) : null}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? 'Cargando clientes…' : 'Sin resultados.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.nombre}</Text>
            <Text style={styles.row}>
              {item.direccion} · {item.telefono}
            </Text>
            <Text style={styles.row}>Pedido típico: {item.pedido}</Text>
            <View style={styles.actions}>
              <Button
                label="Editar"
                variant="secondary"
                onPress={() => {
                  setEditingId(item.id);
                  setNombre(item.nombre);
                  setDireccion(item.direccion);
                  setTelefono(item.telefono);
                  setPedido(item.pedido);
                  setShowForm(true);
                }}
              />
              <Button
                label="Eliminar"
                variant="danger"
                onPress={() => confirmarEliminar(item)}
              />
            </View>
          </View>
        )}
      />
      <Button
        label={showForm ? 'OCULTAR FORMULARIO' : 'AGREGAR CLIENTE'}
        onPress={() => setShowForm((v) => !v)}
        variant="secondary"
      />
      <Button
        label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR LISTA'}
        onPress={() => void cargar()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 8 },
  feedbackOk: { backgroundColor: '#ecfdf3', borderColor: '#52c47a' },
  feedbackError: { backgroundColor: '#fff3f3', borderColor: '#e06a6a' },
  feedbackText: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
    fontFamily: 'Poppins_400Regular',
    marginBottom: 8,
  },
  empty: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8 },
  title: { fontFamily: 'Poppins_700Bold' },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
