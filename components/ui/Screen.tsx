import { Children, isValidElement, type PropsWithChildren } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { COLORS } from '@/constants/colors';

interface Props extends PropsWithChildren {
  title: string;
  subtitle?: string;
}

export function Screen({ title, subtitle, children }: Props) {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isCompact = width < 420;
  const bodyHorizontal = isCompact ? 12 : 16;
  const maxBodyWidth = width >= 1360 ? 1180 : width >= 1024 ? 1040 : 960;

  const spaced = Children.map(children, (child, index) => {
    if (!isValidElement(child)) return child;
    return (
      <View key={index} style={index > 0 ? styles.childSpacing : undefined}>
        {child}
      </View>
    );
  });

  // En web, SafeAreaView a veces no reparte altura con Tabs → contenido en blanco.
  const Root = isWeb ? View : SafeAreaView;
  const rootStyle = isWeb ? [styles.safe, styles.safeWeb] : styles.safe;

  return (
    <Root style={rootStyle}>
      <View style={[styles.header, { paddingHorizontal: bodyHorizontal, paddingVertical: isCompact ? 12 : 16 }]}>
        <Text style={[styles.title, { fontSize: isCompact ? 20 : 24 }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { fontSize: isCompact ? 12 : 13 }]}>{subtitle}</Text> : null}
      </View>
      {isWeb ? (
        <ScrollView style={styles.bodyScrollWeb} contentContainerStyle={styles.bodyScrollWebContent}>
          <View
            style={[
              styles.body,
              { paddingHorizontal: bodyHorizontal, paddingVertical: isCompact ? 12 : 16 },
              styles.bodyWeb,
              { maxWidth: maxBodyWidth },
            ]}
          >
            {spaced}
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.body, { paddingHorizontal: bodyHorizontal, paddingVertical: isCompact ? 12 : 16 }]}>
          {spaced}
        </View>
      )}
    </Root>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.grisClaro },
  safeWeb: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  header: { backgroundColor: COLORS.verdePrincipal, padding: 16 },
  title: { color: '#fff', fontFamily: 'Poppins_800ExtraBold' },
  subtitle: { color: '#edf6e6', fontFamily: 'Poppins_400Regular', marginTop: 2 },
  body: { flex: 1, minHeight: 0 },
  bodyWeb: {
    flex: 1,
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
  },
  bodyScrollWeb: { flex: 1, width: '100%' },
  bodyScrollWebContent: { flexGrow: 1, paddingBottom: 24 },
  childSpacing: { marginTop: 12 },
});
