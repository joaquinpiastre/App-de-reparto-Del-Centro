import { router } from 'expo-router';
import { useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAppStore } from '@/store/useAppStore';

const webStyle = `
.m-signature-pad { box-shadow: none; border: none; }
.m-signature-pad--body { border: 1px solid #6DC921; border-radius: 12px; }
.m-signature-pad--footer { display: none; }
body,html { width: 100%; height: 100%; }
`;

export default function Firma() {
  const ref = useRef<SignatureViewRef>(null);
  const completarEntregaActual = useAppStore((s) => s.completarEntregaActual);

  const onFirma = (sig: string) => {
    completarEntregaActual({ firmaBase64: sig });
    router.replace('/(repartidor)/ruta-del-dia');
  };

  return (
    <Screen title="Firma del cliente" subtitle="Pedí la firma del cliente">
      <View style={styles.padWrap}>
        <SignatureScreen
          ref={ref}
          onOK={onFirma}
          onEmpty={() => Alert.alert('Firma', 'La firma está vacía. Pedile al cliente que firme.')}
          webStyle={webStyle}
          descriptionText="Firma en el recuadro"
        />
      </View>
      <Button label="LIMPIAR" variant="secondary" onPress={() => ref.current?.clearSignature()} />
      <Button
        label="CONFIRMAR ENTREGA"
        onPress={() => ref.current?.readSignature()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  padWrap: { height: 260, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
});
