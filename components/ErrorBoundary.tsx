import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Sin esto, cualquier error al renderizar una pantalla (un dato inesperado,
// un campo nulo, etc.) tira abajo toda la app en producción — el repartidor
// ve el cartel nativo "Del Centro Reparto se detuvo" y pierde lo que estaba
// haciendo. Con el boundary, ese error queda contenido acá y se puede
// reintentar sin perder la sesión ni la jornada en curso.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error.message, info.componentStack ?? '');
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.cont}>
          <Text style={styles.titulo}>Uy, algo salió mal</Text>
          <Text style={styles.detalle}>
            La app encontró un problema inesperado y tuvo que detener esta pantalla.{'\n'}
            Tu sesión y tu jornada siguen activas — probá continuar.
          </Text>
          <Button label="Continuar" onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  cont: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
    backgroundColor: COLORS.grisClaro,
  },
  titulo: { fontFamily: 'Poppins_800ExtraBold', fontSize: 20, color: COLORS.grisTexto },
  detalle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisSecundario,
    textAlign: 'center',
    lineHeight: 20,
  },
});
