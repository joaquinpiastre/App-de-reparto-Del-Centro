import { StyleSheet, Text, View } from 'react-native';

export function Avatar({ nombre }: { nombre: string }) {
  const initial = nombre.slice(0, 1).toUpperCase();
  return (
    <View style={styles.circle}>
      <Text style={styles.text}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2196F3' },
  text: { color: '#fff', fontFamily: 'Poppins_700Bold' },
});
