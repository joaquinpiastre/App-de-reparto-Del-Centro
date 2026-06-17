import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import {
  desactivarDispositivoGps,
  listarDispositivosGps,
  registrarDispositivoGps,
  type DispositivoGps,
} from '@/services/adminDispositivosGps';
import { listarRepartidoresAdmin } from '@/services/adminRepartidores';
import type { Usuario } from '@/types';

function formatUltimoContacto(ms: number | null): string {
  if (!ms) return 'Sin contacto';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Hace menos de 1 min';
  if (mins < 60) return `Hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `Hace ${hs} h`;
  return `Hace ${Math.floor(hs / 24)} d`;
}

function estadoConexion(ms: number | null): { texto: string; color: string } {
  if (!ms) return { texto: 'Sin datos', color: '#9aa5af' };
  const diff = Date.now() - ms;
  if (diff < 2 * 60_000) return { texto: 'En línea', color: '#52c47a' };
  if (diff < 10 * 60_000) return { texto: 'Reciente', color: '#f5a623' };
  return { texto: 'Sin señal', color: '#e06a6a' };
}

export default function TrackersAdminScreen() {
  const [dispositivos, setDispositivos] = useState<DispositivoGps[]>([]);
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [imei, setImei] = useState('');
  const [nombre, setNombre] = useState('');
  const [repartidorId, setRepartidorId] = useState('');
  const [editandoImei, setEditandoImei] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const [devs, reps] = await Promise.all([
        listarDispositivosGps(),
        listarRepartidoresAdmin(false),
      ]);
      setDispositivos(devs);
      setRepartidores(reps.filter((r) => r.rol === 'repartidor'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los trackers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const resetForm = () => {
    setImei('');
    setNombre('');
    setRepartidorId('');
    setEditandoImei(null);
  };

  const guardar = async () => {
    const imeiLimpio = imei.trim().replace(/\s/g, '');
    const nombreLimpio = nombre.trim();
    if (!editandoImei && (!/^\d{15}$/.test(imeiLimpio))) {
      setError('El IMEI debe ser exactamente 15 dígitos numéricos.');
      return;
    }
    if (!nombreLimpio) {
      setError('Ingresá un nombre para el tracker (ej: "GT06E - Juan").');
      return;
    }
    if (!repartidorId) {
      setError('Seleccioná el repartidor al que se asigna este tracker.');
      return;
    }
    try {
      setGuardando(true);
      setError(null);
      setOk(null);
      await registrarDispositivoGps(editandoImei ?? imeiLimpio, repartidorId, nombreLimpio);
      setOk(editandoImei ? 'Tracker actualizado.' : 'Tracker registrado correctamente.');
      resetForm();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el tracker.');
    } finally {
      setGuardando(false);
    }
  };

  const desactivar = (d: DispositivoGps) => {
    const ejecutar = () => {
      void (async () => {
        try {
          setGuardando(true);
          setError(null);
          setOk(null);
          await desactivarDispositivoGps(d.imei);
          setOk(`Tracker "${d.nombre}" desactivado.`);
          await cargar();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo desactivar.');
        } finally {
          setGuardando(false);
        }
      })();
    };
    if (Platform.OS === 'web') {
      if (globalThis?.confirm?.(`¿Desactivar el tracker "${d.nombre}"?`)) ejecutar();
      return;
    }
    Alert.alert('Desactivar tracker', `¿Desactivar "${d.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: ejecutar },
    ]);
  };

  const nombreRepartidor = (id: string) =>
    repartidores.find((r) => r.id === id)?.nombre ?? id;

  return (
    <Screen title="Trackers GPS" subtitle="Gestión de rastreadores físicos asignados a repartidores" scrollable>
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

      {/* Formulario */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{editandoImei ? 'Reasignar tracker' : 'Registrar tracker'}</Text>

        <Text style={styles.label}>IMEI del tracker (15 dígitos)</Text>
        <TextInput
          style={[styles.input, editandoImei ? styles.inputDisabled : undefined]}
          placeholder="Ej: 866557081514103"
          value={editandoImei ?? imei}
          onChangeText={setImei}
          editable={!editandoImei}
          keyboardType="number-pad"
          maxLength={15}
        />

        <Text style={styles.label}>Nombre del tracker</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: GT06E - Juan"
          value={nombre}
          onChangeText={setNombre}
        />

        <Text style={styles.label}>Asignar a repartidor</Text>
        {repartidores.length === 0 ? (
          <Text style={styles.empty}>Cargando repartidores…</Text>
        ) : (
          <View style={styles.selectorGrid}>
            {repartidores.map((r) => (
              <Button
                key={r.id}
                label={r.nombre}
                variant={repartidorId === r.id ? 'primary' : 'secondary'}
                onPress={() => setRepartidorId(r.id)}
              />
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label={guardando ? 'GUARDANDO…' : editandoImei ? 'GUARDAR CAMBIOS' : 'REGISTRAR TRACKER'}
            loading={guardando}
            onPress={() => void guardar()}
          />
          {editandoImei ? (
            <Button label="CANCELAR" variant="secondary" onPress={resetForm} />
          ) : null}
        </View>
      </View>

      {/* Lista */}
      <View style={styles.card}>
        <View style={styles.headerList}>
          <Text style={styles.cardTitle}>Trackers registrados</Text>
          <Button
            label={loading ? 'CARGANDO…' : 'ACTUALIZAR'}
            variant="secondary"
            loading={loading}
            onPress={() => void cargar()}
          />
        </View>

        {dispositivos.length === 0 ? (
          <Text style={styles.empty}>
            {loading ? 'Cargando…' : 'No hay trackers registrados todavía.'}
          </Text>
        ) : (
          dispositivos.map((d) => {
            const estado = estadoConexion(d.ultimo_contacto_ms);
            return (
              <View key={d.imei} style={styles.rowCard}>
                <View style={styles.headerRow}>
                  <Text style={styles.nombre}>{d.nombre}</Text>
                  <View style={[styles.badge, { backgroundColor: estado.color + '22', borderColor: estado.color }]}>
                    <Text style={[styles.badgeTxt, { color: estado.color }]}>{estado.texto}</Text>
                  </View>
                </View>
                <Text style={styles.detalle}>IMEI: {d.imei}</Text>
                <Text style={styles.detalle}>Repartidor: {nombreRepartidor(d.repartidor_id)}</Text>
                <Text style={styles.detalle}>Último contacto: {formatUltimoContacto(d.ultimo_contacto_ms)}</Text>
                <View style={styles.actions}>
                  <Button
                    label="Reasignar"
                    variant="secondary"
                    onPress={() => {
                      setEditandoImei(d.imei);
                      setNombre(d.nombre);
                      setRepartidorId(d.repartidor_id);
                    }}
                  />
                  <Button
                    label="Desactivar"
                    variant="danger"
                    onPress={() => desactivar(d)}
                  />
                </View>
              </View>
            );
          })
        )}
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
  label: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto, marginTop: 8 },
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
  selectorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  headerList: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCard: {
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    backgroundColor: '#fafafa',
  },
  nombre: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  detalle: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 3 },
  empty: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
});
