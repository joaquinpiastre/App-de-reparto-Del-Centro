# Guía para presentar la app — Del Centro Reparto

Documento pensado para que vos expliques el sistema al cliente y para que el equipo sepa qué está hecho y qué falta para producción.

---

## 1. Qué es la aplicación

Es una **app móvil** (Android con Expo; iOS posible con el mismo código) para **Del Centro Pinturerías**, con **dos perfiles**:

| Perfil | Quién la usa | Para qué |
|--------|----------------|----------|
| **Repartidor** | Chofer / reparto | Ver ruta del día, navegar, registrar entregas (foto + firma), ver resumen, levantar **pedidos en calle** con lista de precios. |
| **Admin** | Dueño / mostrador / logística | Mismo sistema en **teléfono** o, recomendado, **panel en el navegador de la PC** (Chrome, Edge, etc.). |

El acceso hoy es **modo demostración**: usuario + PIN de 4 dígitos (sin servidor de login todavía).

### Cómo se despliega en la empresa (modelo que describiste)

- **Teléfonos de la empresa:** ahí se instala la **app Android** (APK / Play Store cuando esté publicada). Los repartidores trabajan **con internet** para que los datos (ruta, pedidos, posición, etc.) lleguen al backend.
- **Administrador:** no está obligado a usar el celular: puede abrir el **panel web** en una computadora en la misma oficina o en casa, siempre con internet, y ver el mismo panel de pedidos, mapa, historial y estadísticas.
- La **app no tiene que instalarse en la PC**: en escritorio solo abrís el **sitio del panel** (en desarrollo: `npm run web` y entrás a la URL que muestra Expo; en producción: la URL donde publiquen el build web, por ejemplo en su hosting o en la nube).

La sincronización en tiempo real entre **los teléfonos** se logra con **Firebase** configurado en `services/firebase.ts`. El **panel en el navegador** usa por ahora almacenamiento **local** (misma API, sin cargar el SDK de Firebase en el bundle web, para evitar errores del tipo `import.meta` en el navegador). Para ver en la PC los mismos pedidos que en los móviles hace falta una capa intermedia (API propia, o más adelante un build web con Firebase compat / hosting que sirva el bundle como módulo ES).

---

## 2. Panel web (admin desde la computadora)

1. En la carpeta del proyecto, ejecutá: `npm run web` (o `npx expo start --web`).
2. Abrí en el navegador la URL que indica la terminal (suele ser `http://localhost:8081` o similar).
3. Iniciá sesión con usuario **admin** y PIN **1234**.
4. Vas a ver las mismas secciones que en la app: **Dashboard, Pedidos, Mapa, Historial, Estadísticas, Clientes**. El mapa en web usa un **iframe de Google Maps** (no requiere instalar la app).
5. **Nuevos pedidos en calle:** con Firebase activo, los pedidos que manden los repartidores desde el teléfono aparecen en la pestaña **Pedidos** del navegador. En web, el aviso puede mostrarse como **alerta del navegador** en lugar de notificación push del sistema.

Los flujos de **cámara y firma** del repartidor no se usan en PC: si alguien entra con usuario repartidor en el navegador, esas pantallas muestran un mensaje indicando que deben usarse en el teléfono.

---

## 3. Cómo entrar (demo mañana)

- **PIN para todos:** `1234`
- **Admin:** usuario `admin` (o cualquier usuario que contenga la palabra `admin`)
- **Repartidor:** por ejemplo `carlos` (cualquier otro nombre que no sea admin)

En la pantalla de login ya aparece un texto recordatorio con estos datos.

---

## 4. Flujo repartidor (qué mostrar en la demo)

1. **Iniciar turno**  
   En la pantalla principal, **INICIAR TURNO**. Eso **carga la ruta del día** (clientes de demostración) en memoria.

2. **Ruta** (pestaña o botón “Ver mi ruta”)  
   - Mapa con paradas y lista ordenada.  
   - **NAVEGAR** abre Google Maps hacia la dirección.  
   - **ENTREGAR** lleva a la pantalla de entrega activa.

3. **Entrega**  
   - Temporizador de parada, llamada al cliente, **Registrar entrega** → **foto** (cámara real) → **firma** del cliente (pantalla táctil).  
   - Al confirmar, la parada queda como **entregada** y podés seguir con la siguiente.

4. **Pedido en la calle** (diferencial fuerte)  
   - Desde inicio: **“Pedido en la calle (Excel)”**.  
   - Importás un **.xlsx** desde el teléfono (no va una carpeta fija en la PC del desarrollador).  
   - Buscás productos, armás el pedido, indicás **calle de referencia** (para agrupar con la ruta), enviás al local.  
   - Si el turno está iniciado, la app muestra **clientes de la ruta en esa misma calle**.

5. **Resumen / cerrar turno**  
   - Métricas del turno, compartir reporte (PDF generado en el dispositivo).  
   - **Cerrar turno** guarda un resumen en el historial (local).

---

## 5. Flujo admin (qué mostrar en la demo)

1. Entrar como **admin** + PIN `1234`.
2. **Dashboard:** resumen y cantidad de pedidos en calle pendientes.
3. **Pedidos:** listado de pedidos levantados por el repartidor; podés marcar **visto** / **armado**.  
   - Con la app abierta, puede aparecer una **notificación** cuando entra un pedido nuevo (según permisos del sistema).
4. **Mapa:** posición aproximada del dispositivo (demo; en producción se enlaza a GPS de repartidores en Firebase).
5. **Historial / Estadísticas / Clientes:** datos de demostración o cierres guardados en el teléfono.

---

## 6. Cómo se cargan los clientes de la ruta (importante)

**Hoy no vienen de un Excel ni de Firebase en tiempo real para la ruta.**

- Al **iniciar el turno**, la app **copia una lista fija** definida en código: archivo  
  `constants/demoData.ts` → constante **`CLIENTES_DEMO_SEED`**.
- Ahí está cada cliente con: nombre, dirección, teléfono, texto del pedido, coordenadas para el mapa, orden de visita, etc.

**Para producción**, lo habitual es:

- Que un **admin cargue el día** desde un panel o desde Firestore (`clientes` / `rutas_del_dia`), y  
- Que la app del repartidor **lea esa ruta** al iniciar jornada (reemplazar el `CLIENTES_DEMO_SEED` por datos del backend).

**Mensaje claro para el cliente:**  
*“La demo usa clientes de ejemplo en San Rafael; cuando conectemos su base de datos o su planilla del día, la misma pantalla mostrará sus clientes reales.”*

---

## 7. Excel del catálogo de productos — dónde “va” el archivo

**No se coloca el Excel dentro de la carpeta del proyecto para que la app lo lea sola.**

Flujo real:

1. Tenés un archivo **`.xlsx`** (o `.xls`) en el **teléfono** (Descargas, Drive, WhatsApp, correo, etc.).
2. En la app, **Pedido en la calle** → **Importar Excel de precios**.
3. El sistema abre el selector de archivos del teléfono; elegís ese Excel.
4. La app lee la **primera hoja**, detecta columnas por nombre flexible (código, descripción/producto, precio) y **guarda el catálogo en el dispositivo** (persistente hasta que importes otro archivo).

**Para la presentación de mañana:**

- Mandate el archivo de ejemplo al teléfono: en el repo está  
  **`docs/ejemplo-lista-precios.csv`**  
  Abrilo en Excel en la PC → **Guardar como** → **Libro de Excel (.xlsx)** → enviátelo al celular por WhatsApp o cable.
- O creá en Excel una tabla con encabezados del estilo: `codigo`, `descripcion`, `precio` (ver README / primera fila del CSV de ejemplo).

---

## 8. Qué está listo vs. qué es “siguiente fase”

**Listo para mostrar (demo sólida):**

- Dos perfiles, UI de marca, ruta con mapa, entrega con foto y firma, pedidos en calle con Excel, panel admin de esos pedidos, **panel administrador en navegador (PC)**, notificaciones (locales en móvil; en web alerta de navegador), resumen y gráficos básicos desde historial local.

**Típico siguiente paso (producción):**

- Firebase (o API propia) con **login real**, **clientes y rutas del día** desde la nube, reglas de seguridad, **APK** firmada con EAS, claves de **Google Maps** de producción, y si hace falta **push** en segundo plano entre dispositivos.

---

## 9. Guion corto para mañana (5–8 minutos)

1. *“Esta es la app de reparto y de coordinación con el local.”*  
2. Login repartidor → iniciar turno → ruta en mapa → una entrega con foto y firma.  
3. Pedido en calle: importar Excel → buscar producto → enviar pedido.  
4. Cambiar a admin (cerrar sesión / otro dispositivo): mostrar el pedido en **Pedidos**.  
5. Cerrar con: *“Los clientes de la ruta hoy son demo; el catálogo lo cargan ustedes con Excel en el teléfono; lo que sigue es conectar su base de datos y publicar la app en Play Store.”*

---

## 10. Archivos útiles en el proyecto

| Archivo | Uso |
|---------|-----|
| `constants/demoData.ts` | Clientes y coordenadas de la demo de ruta |
| `constants/demoAuth.ts` | PIN y usuarios de demo |
| `docs/ejemplo-lista-precios.csv` | Base para generar un `.xlsx` de prueba |
| `services/firebase.ts` | Configuración Firebase (placeholders hasta producción) |
| `GUIA_PRESENTACION.md` | Este documento |

---

*Éxitos con la presentación.*
