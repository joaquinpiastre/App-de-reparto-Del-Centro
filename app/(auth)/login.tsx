import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { LogoDelCentro } from '@/components/LogoDelCentro';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { loginApi } from '@/services/authApi';
import { useAppStore } from '@/store/useAppStore';

export default function LoginScreen() {
  const [usuario, setUsuarioInput] = useState('');
  const [pin, setPin] = useState('');
  const setUsuarioGlobal = useAppStore((s) => s.setUsuario);

  const ingresar = async () => {
    const u = usuario.trim().toLowerCase();
    const p = pin.trim();
    if (!u || p.length !== 4) {
      Alert.alert('Datos incompletos', 'Ingresá usuario y PIN de 4 dígitos.');
      return;
    }
    let rolFinal: 'admin' | 'repartidor';
    try {
      const remoto = await loginApi(u, p);
      if (!remoto) {
        Alert.alert('Login', 'No se pudo autenticar contra el backend. Verificá la API.');
        return;
      }
      setUsuarioGlobal(remoto);
      rolFinal = remoto.rol;
    } catch (e) {
      Alert.alert('Login', e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
      return;
    }
    if (rolFinal === 'admin') {
      router.replace('/(admin)');
      return;
    }
    router.replace('/(repartidor)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <LogoDelCentro size={120} />
        <Text style={styles.titulo}>Sistema de Reparto</Text>
        {Platform.OS === 'web' ? (
          <View style={styles.webBanner}>
            <Text style={styles.webBannerTitle}>Panel web (computadora)</Text>
            <Text style={styles.webBannerText}>
              Ingresá con usuarios reales creados en el backend. El seguimiento de rutas y pedidos en tiempo real
              requiere conexión y API operativa.
            </Text>
          </View>
        ) : null}
        <View style={[styles.card, Platform.OS === 'web' ? styles.cardWeb : undefined]}>
          <TextInput placeholder="Usuario / Código de repartidor" placeholderTextColor={COLORS.grisSecundario} style={[styles.input, styles.inputSpacing]} value={usuario} onChangeText={setUsuarioInput} autoCapitalize="none" autoCorrect={false} />
          <TextInput
            placeholder="PIN (4 dígitos)"
            placeholderTextColor={COLORS.grisSecundario}
            style={[styles.input, styles.inputSpacing]}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry={true}
            maxLength={4}
          />
          <Button label="INGRESAR" onPress={() => void ingresar()} />
        </View>
        <Text style={styles.footer}>Del Centro Pinturerias · v1.0.0</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.verdeOscuro },
  gradientTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.verdePrincipal,
    opacity: 0.95,
  },
  gradientBottom: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.verdeOscuro,
    opacity: 0.35,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  titulo: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 20, marginTop: 16, marginBottom: 22 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 16 },
  cardWeb: { maxWidth: 420 },
  webBanner: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(109,201,33,0.5)',
  },
  webBannerTitle: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro, marginBottom: 6 },
  webBannerText: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, fontSize: 13, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
  },
  inputSpacing: { marginBottom: 12 },
  footer: { color: '#eafadf', fontFamily: 'Poppins_400Regular', marginTop: 8 },
});
