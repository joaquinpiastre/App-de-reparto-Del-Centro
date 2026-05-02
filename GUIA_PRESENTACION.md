# Guía Del Centro Reparto — uso y publicación

Documento para explicar el sistema al cliente y dejar claro el despliegue en producción.

---

## 1. Qué es la aplicación

App móvil (Expo / Android; iOS posible con el mismo código) para **Del Centro Pinturerías**, con **dos perfiles**:

| Perfil | Quién la usa | Para qué |
|--------|----------------|----------|
| **Repartidor** | Chofer / reparto | Ruta del día, navegación, entregas (foto + firma), resumen, **pedidos en calle** (carga manual de productos; el admin publica el catálogo Excel central). |
| **Admin** | Mostrador / logística | Misma app en **teléfono** o **navegador en PC** (recomendado). |

**Acceso:** login con **usuario y PIN de 4 dígitos** contra el **backend** (PostgreSQL + JWT en Railway u otro hosting). Los usuarios se crean desde el panel **Repartidores** (admin) o vía API.

**Sincronización:** la app usa la **API REST** (`EXPO_PUBLIC_API_URL`). Pedidos admin, pedidos en calle, entregas, clientes/talleres del catálogo y posición GPS se envían al servidor cuando está configurado.

---

## 2. Panel web (admin desde la computadora)

1. `npm run web` (o `npx expo start --web`).
2. Abrí la URL de la terminal (p. ej. `http://localhost:8081`).
3. Iniciá sesión con un usuario **admin** creado en el backend.
4. Secciones: **Dashboard, Pedidos, Mapa, Historial, Estadísticas, Clientes** (incluye talleres en el catálogo compartido).
5. **Pedidos en calle:** listado completo con filtros; el repartidor carga pedidos a mano; el admin sube el **catálogo Excel** para quien use lista central.

Cámara y firma del repartidor son para **móvil**; en web esas pantallas avisan que se usen en el teléfono.

---

## 3. Cómo entrar (producción)

- **Usuarios y PIN** los define el negocio al **crear repartidores y admin** en el backend (ver pestaña **Repartidores** o variables `DEMO_PIN` por defecto al crear cuentas sin PIN).
- Configurar **`.env`** en la app: `EXPO_PUBLIC_API_URL` apuntando al backend público (`https://...`).

---

## 4. Flujo repartidor

1. **Iniciar turno** — Carga la ruta con los **pedidos asignados** al repartidor (API `admin-pedidos`: estados pendiente / asignado / en ruta).
2. **Ruta** — Mapa y lista; **NAVEGAR** abre Google Maps; **ENTREGAR** inicia el flujo foto + firma.
3. **Entrega** — Foto, firma, registro de entrega y sincronización con el backend.
4. **Pedido en la calle** — Carga **manual** de producto y precio (sin Excel en el repartidor); envío al local.
5. **Resumen** — Métricas del turno; cierre de jornada e historial.

---

## 5. Flujo admin

1. **Dashboard** — Resumen de pedidos activos.
2. **Pedidos** — Catálogo central Excel, pedidos de calle (todos los estados), creación y asignación de pedidos a calles y repartidores.
3. **Mapa** — Seguimiento de posiciones reportadas.
4. **Historial / Estadísticas** — Desde la API de reportes cuando está disponible; datos locales como respaldo.
5. **Clientes** — Catálogo de **clientes y talleres** (alta edición; baja solo admin).

---

## 6. Cómo se arma la ruta (importante)

- Al **iniciar turno**, la app **pide a la API** la lista de **pedidos del repartidor** en estado adecuado y construye la ruta (optimización y mapa con coordenadas derivadas del ID hasta geocodificar direcciones reales).
- **No** hay lista fija de clientes de demostración en el código: el día a día lo cargan **admin** (pedidos y asignación).

---

## 7. Excel del catálogo (admin)

1. El admin importa un **.xlsx** en **Pedidos** y lo **publica** al catálogo central.
2. Los dispositivos que usan catálogo central **sincronizan** contra la API.
3. Plantilla de columnas: `docs/ejemplo-lista-precios.csv` (abrir en Excel, guardar como `.xlsx`).

---

## 8. Listo para publicar (checklist)

- [ ] `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_API_KEY_MOBILE` (si aplica) en Vercel / EAS.
- [ ] Backend: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `API_KEY_MOBILE`, `DEMO_PIN` o PINs reales por usuario.
- [ ] **Google Maps** API key de producción en `app.json` (Android).
- [ ] **`.env.example`** del repo **sin secretos reales** (solo placeholders).
- [ ] Build web (`expo export` / hosting) y/o **APK** con EAS.

---

## 9. Archivos útiles

| Archivo | Uso |
|---------|-----|
| `.env.example` | Variables de la app (URL API, clave móvil). |
| `backend/.env.example` | Variables del servidor (DB, JWT, CORS, PIN por defecto). |
| `constants/mapRegion.ts` | Región inicial de mapas (San Rafael). |
| `docs/ejemplo-lista-precios.csv` | Base para Excel de catálogo. |
| `GUIA_PRESENTACION.md` | Este documento |

---

*Del Centro Pinturerías · San Rafael, Mendoza.*
