import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';

export function Header({ title, nombre }: { title: string; nombre?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {nombre ? <Avatar nombre={nombre} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#6DC921', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Poppins_800ExtraBold', color: '#fff', fontSize: 20 },
});
