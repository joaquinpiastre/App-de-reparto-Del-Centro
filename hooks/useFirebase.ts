import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';

export async function obtenerClientes() {
  const snap = await getDocs(collection(db, 'clientes'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
