import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';

/** La cámara solo aplica a la app instalada en el teléfono del repartidor. */
export default function CamaraWeb() {
  return (
    <Screen title="Foto de confirmación" subtitle="Solo en la app móvil">
      <View style={styles.box}>
        <Text style={styles.body}>
          La captura de foto del pedido se realiza desde la aplicación Android instalada en los teléfonos de
          la empresa. En el navegador no está disponible.
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
