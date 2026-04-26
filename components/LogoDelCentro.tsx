import { View } from 'react-native';
import { LOGO_PETALS } from '@/constants/colors';

interface Props {
  size?: number;
}

/**
 * Marca sin react-native-svg en la primera pantalla: en Android (Fabric) SVG a veces
 * dispara ClassCastException si alguna prop termina mal tipada en el nativo.
 */
export function LogoDelCentro({ size = 80 }: Props) {
  const petal = Math.max(8, size * 0.11);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: '#6DC921',
        alignItems: 'center',
        justifyContent: 'center',
        padding: size * 0.08,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: size * 0.92,
        }}
      >
        {LOGO_PETALS.map((color, i) => (
          <View
            key={`${color}-${i}`}
            style={{
              width: petal,
              height: petal,
              borderRadius: petal / 2,
              backgroundColor: color,
              margin: 3,
            }}
          />
        ))}
      </View>
    </View>
  );
}
