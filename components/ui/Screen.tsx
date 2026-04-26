import { Children, isValidElement, type PropsWithChildren } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/constants/colors';

interface Props extends PropsWithChildren {
  title: string;
  subtitle?: string;
}

export function Screen({ title, subtitle, children }: Props) {
  const spaced = Children.map(children, (child, index) => {
    if (!isValidElement(child)) return child;
    return (
      <View key={index} style={index > 0 ? styles.childSpacing : undefined}>
        {child}
      </View>
    );
  });

  // En web, SafeAreaView a veces no reparte altura con Tabs → contenido en blanco.
  const Root = Platform.OS === 'web' ? View : SafeAreaView;
  const rootStyle =
    Platform.OS === 'web' ? [styles.safe, styles.safeWeb] : styles.safe;

  return (
    <Root style={rootStyle}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.body, Platform.OS === 'web' ? styles.bodyWeb : undefined]}>{spaced}</View>
    </Root>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.grisClaro },
  safeWeb: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  header: { backgroundColor: COLORS.verdePrincipal, padding: 16 },
  title: { color: '#fff', fontFamily: 'Poppins_800ExtraBold', fontSize: 22 },
  subtitle: { color: '#edf6e6', fontFamily: 'Poppins_400Regular', marginTop: 2 },
  body: { flex: 1, padding: 16, minHeight: 0 },
  bodyWeb: {
    flex: 1,
    flexGrow: 1,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  childSpacing: { marginTop: 12 },
});
