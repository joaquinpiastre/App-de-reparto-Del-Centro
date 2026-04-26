import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';

/** La firma táctil solo aplica a la app en el teléfono. */
export default function FirmaWeb() {
  return (
    <Screen title="Firma del cliente" subtitle="Solo en la app móvil">
      <View style={styles.box}>
        <Text style={styles.body}>
          La firma del cliente se registra en pantalla desde la app instalada en el dispositivo del
          repartidor, no desde el panel web.
        </Text>
      </View>
      <Button label="VOLVER" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  body: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, lineHeight: 22 },
});
