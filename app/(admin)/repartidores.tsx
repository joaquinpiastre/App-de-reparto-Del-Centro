import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import {
  actualizarRepartidorAdmin,
  crearRepartidorAdmin,
  listarRepartidoresAdmin,
} from '@/services/adminRepartidores';
import type { Usuario } from '@/types';

function usuarioDesdeId(id: string): string {
  return id.replace(/^usr-/, '');
}

export default function RepartidoresAdminScreen() {
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const tituloForm = useMemo(
    () => (editingId ? 'Editar repartidor' : 'Nuevo repartidor'),
    [editingId]
  );

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listarRepartidoresAdmin(true);
      setRepartidores(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los repartidores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setUsuario('');
    setNombre('');
  };

  const guardar = async () => {
    const usuarioLimpio = usuario.trim().toLowerCase();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setError('Ingresá el nombre del repartidor.');
      return;
    }
    if (!editingId && !usuarioLimpio) {
      setError('Ingresá el usuario para crear el repartidor.');
      return;
    }
    try {
      setGuardando(true);
      setError(null);
      setOk(null);
      if (editingId) {
        await actualizarRepartidorAdmin(editingId, { nombre: nombreLimpio });
        setOk('Repartidor actualizado.');
      } else {
        await crearRepartidorAdmin(usuarioLimpio, nombreLimpio);
        setOk('Repartidor creado.');
      }
      resetForm();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el repartidor.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = async (r: Usuario) => {
    try {
      setGuardando(true);
      setError(null);
      setOk(null);
      await actualizarRepartidorAdmin(r.id, { activo: !r.activo });
      setOk(r.activo ? 'Repartidor desactivado.' : 'Repartidor activado.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Screen title="Repartidores" subtitle="Alta, edición y estado de los repartidores de la tienda">
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tituloForm}</Text>
        <Text style={styles.label}>Usuario {editingId ? '(no editable)' : ''}</Text>
        <TextInput
          style={[styles.input, editingId ? styles.inputDisabled : undefined]}
          placeholder="Ej: carlos"
          value={usuario}
          onChangeText={setUsuario}
          editable={!editingId}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Nombre visible</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Carlos"
          value={nombre}
          onChangeText={setNombre}
        />
        <View style={styles.actions}>
          <Button
            label={guardando ? 'GUARDANDO…' : editingId ? 'GUARDAR CAMBIOS' : 'CREAR REPARTIDOR'}
            loading={guardando}
            onPress={() => void guardar()}
          />
          {editingId ? (
            <Button
              label="CANCELAR EDICIÓN"
              variant="secondary"
              onPress={resetForm}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.headerList}>
          <Text style={styles.cardTitle}>Listado</Text>
          <Button
            label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}
            variant="secondary"
            loading={loading}
            onPress={() => void cargar()}
          />
        </View>
        <FlatList
          data={repartidores}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {loading ? 'Cargando repartidores…' : 'No hay repartidores cargados.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.rowCard}>
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.detalle}>Usuario: {usuarioDesdeId(item.id)}</Text>
              <Text style={styles.detalle}>Estado: {item.activo ? 'Activo' : 'Inactivo'}</Text>
              <View style={styles.actions}>
                <Button
                  label="Editar nombre"
                  variant="secondary"
                  onPress={() => {
                    setEditingId(item.id);
                    setUsuario(usuarioDesdeId(item.id));
                    setNombre(item.nombre);
                  }}
                />
                <Button
                  label={item.activo ? 'Desactivar' : 'Activar'}
                  variant={item.activo ? 'warning' : 'primary'}
                  onPress={() => void cambiarActivo(item)}
                />
              </View>
            </View>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { borderRadius: 12, padding: 10, borderWidth: 1 },
  feedbackOk: { backgroundColor: '#ecfdf3', borderColor: '#52c47a' },
  feedbackError: { backgroundColor: '#fff3f3', borderColor: '#e06a6a' },
  feedbackText: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  cardTitle: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto, marginBottom: 8 },
  label: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Poppins_400Regular',
    backgroundColor: '#fff',
    marginTop: 6,
  },
  inputDisabled: { backgroundColor: '#f3f3f3' },
  headerList: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCard: {
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    backgroundColor: '#fff',
  },
  nombre: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  detalle: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 2 },
  empty: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
