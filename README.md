# Mas Boronat — Gestión Operativa

Aplicación web interna para el personal de Mas Boronat (Salomó, Tarragona): gestión de alojamientos, restaurante, limpieza, mantenimiento, eventos, planning y finanzas, con control de acceso por rol.

Este documento existe para que cualquier persona —tú dentro de un año, u otro desarrollador— pueda entender cómo está construida la aplicación sin depender del historial de conversación donde se creó.

---

## 1. Qué es y cómo está desplegada

- **Frontend**: React (Vite), un único archivo principal `src/App.jsx` (~3.900 líneas) más módulos de apoyo (`i18n.jsx`, `supabaseClient.js`, `Login.jsx`, `SetPassword.jsx`, `ErrorBoundary.jsx`).
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions).
- **Hosting**: Vercel, desplegado automáticamente al hacer push a la rama `main` del repositorio de GitHub.
- **URL de producción**: `masbo.vercel.app` (subdominio gratuito de Vercel — ver sección 8, "Continuidad").
- **Estilos**: Tailwind CSS cargado por CDN (no compilado localmente).
- **Gráficas**: Recharts. **Iconos**: lucide-react.

No hay entorno de pruebas (staging): cada cambio subido a `main` se despliega directamente a lo que usa el personal.

---

## 2. Modelo de datos

### 2.1 Tablas reales, una fila por registro (migrado — antes era un "bloque" por módulo)

Cada módulo tiene su propia tabla en PostgreSQL, con una fila por reserva/ticket/evento/etc., en vez del sistema anterior de "un bloque JSON gigante por módulo". Esto es lo que soluciona de raíz el riesgo de que dos personas editando a la vez se pisen los cambios: cada fila se guarda de forma independiente.

| Tabla | Contenido |
|---|---|
| `rooms` | Las 44 unidades de alojamiento, con su estado de limpieza |
| `guests` | Perfil de huésped (nombre, notas/preferencias) — permite detectar visitas repetidas |
| `stays` | Todas las reservas de alojamiento (pasadas, presentes, futuras), vinculadas a `guests` |
| `bookings` | Reservas de restaurante |
| `tickets` | Tickets de mantenimiento |
| `events` | Eventos (bodas, retiros, etc.) |
| `salones` | Salones interiores + espacios exteriores, con su estado de limpieza |
| `expenses` | Gastos registrados (Finanzas) — lectura y escritura restringidas a Administrador |
| `hotel_status` | Fila única: si el hotel está abierto/cerrado |

**Cómo funciona la protección contra ediciones simultáneas**: `src/supabaseClient.js` tiene una función `syncTable(...)` que, antes de guardar, compara lo que se está guardando contra lo último que ese navegador cargó, y **solo escribe las filas que de verdad cambiaron**. Si dos personas modifican registros distintos casi a la vez, cada una escribe solo su propia fila — ninguna pisa el trabajo de la otra. (Si dos personas editan exactamente el mismo registro en el mismo instante, sigue ganando quien guarda último para esa fila concreta — eso es normal y esperable, igual que en cualquier sistema de reservas real.)

**El frontend sigue usando camelCase** (`checkIn`, `guestName`...) tal cual como siempre — la conversión a snake_case de las columnas (`check_in`, `guest_name`...) ocurre solo dentro de `supabaseClient.js`, así que ningún componente de pantalla tuvo que cambiar por este motivo.

**Sistema anterior (`hotelops_kv`)**: no se ha borrado, sigue existiendo en la base de datos como copia de los datos previos a la migración. No lo usa la aplicación ya. Se puede limpiar más adelante si se confirma que todo funciona bien con las tablas nuevas.

### 2.2 Perfil de huésped recurrente

Cada estancia se vincula automáticamente a un perfil en `guests` (se crea solo, buscando primero si ya existe alguien con ese mismo nombre). En Huéspedes y Alojamientos, si un huésped tiene más de una estancia registrada, aparece una etiqueta "×N" junto a su nombre — al pulsarla se abre su historial completo (todas sus estancias) y un campo de notas/preferencias compartido para todo el equipo (alergias, piso preferido, etc.).

*Limitación a tener en cuenta*: el emparejamiento de huésped es por nombre exacto (sin distinguir mayúsculas/espacios). Si alguien escribe el mismo nombre con una variación notable (p. ej. con o sin segundo apellido), puede acabar en dos perfiles distintos en vez de uno solo. No hay deduplicación automática todavía.

### 2.3 Tablas de sistema (no relacionadas con la operativa diaria)

- **`profiles`**: una fila por cuenta de usuario. Campos clave: `role` (admin/reception/restaurant/housekeeping/maintenance), `must_change_password`.
- **`audit_log`**: registro de auditoría — quién hizo qué, cuándo, en qué módulo. Se llena automáticamente desde el frontend (`logAction(...)` en `supabaseClient.js`) cada vez que se guarda algo.
- **`daily_logins`**: registro de "quién abrió la app hoy", usado por Administrador → Personal → Asistencia.

### 2.4 Roles y permisos

Definidos en `App.jsx`, constante `ROLES`. Cinco roles: `admin`, `reception`, `restaurant`, `housekeeping`, `maintenance`. Cada uno tiene:
- Qué pestañas ve (`tabs`).
- Qué puede editar (gestionado por función `canEdit`).
- Qué puede eliminar (función `canDelete` — más restrictivo que editar; por ejemplo, Recepción edita reservas pero no las elimina).

Los permisos existen en **dos capas**: en el frontend (qué botones se muestran) y en las políticas RLS de Supabase (qué puede escribir cada rol en la base de datos, por si alguien intentara saltarse la interfaz). Ver los archivos SQL en la sección 5.

---

## 3. Funciones automáticas a tener en cuenta

Varias cosas pasan solas, sin que nadie las dispare a mano. Están implementadas como `useEffect` en el componente principal de `App.jsx`:

- **Auto check-out**: cuando pasa la fecha de salida de una estancia, la unidad se marca sola como "Sucia" (para que Limpieza la vea sin que Recepción tenga que avisar). Solo lo ejecutan las cuentas con rol `admin` o `reception` (por permisos de base de datos) — así que para que funcione, alguien con uno de esos roles debe tener la app abierta en algún momento después del check-out.
- **Auto-finalización de eventos**: al pasar la fecha de un evento, se marca "Finalizado" y su salón/espacio se marca "Sucia". Mismo criterio de permisos.
- **Alertas con sonido**: Limpieza y Mantenimiento reciben un aviso sonoro + visual dentro de la app cuando aparece una tarea nueva en su sección (funciona mientras la pestaña esté abierta, aunque sea en segundo plano).
- **Recuperación de borradores**: si el formulario de una reserva se cierra sin guardar (por ejemplo, el navegador descarga la pestaña de memoria), la app detecta el borrador guardado localmente y ofrece recuperarlo.

---

## 4. Multi-idioma (ES / EN / NL)

Todo el texto de la interfaz vive en `src/i18n.jsx`, como tres diccionarios (`es`, `en`, `nl`). El patrón es: cada texto tiene una clave (por ejemplo `guests_title`), y el componente llama a `t("guests_title")`. El idioma se guarda en el navegador de cada persona (`localStorage`), no en el servidor — cada quien elige el suyo.

**Si en el futuro se añade una pantalla o texto nuevo**: hay que añadir la clave en los tres bloques del diccionario (`es`, `en`, `nl`) y usar `t("...")` en vez de escribir el texto literal en español directamente.

---

## 5. Base de datos — SQL ejecutado

Todos los cambios de esquema se hicieron con `create table if not exists` / `create or replace function`, por lo que son seguros de re-ejecutar. Los archivos SQL relevantes:

1. **Configuración inicial**: tabla `profiles`, políticas RLS base de `hotelops_kv`.
2. **Refuerzo de permisos por rol**: políticas RLS que restringen qué puede escribir cada rol en cada clave de `hotelops_kv`.
3. **Contraseña obligatoria**: columna `must_change_password` en `profiles`, función `mark_password_changed()`.
4. **Directorio de personal**: función `get_staff_directory()` (solo admin).
5. **Asistencia diaria**: tabla `daily_logins`, funciones `record_daily_login()` y `get_daily_logins()`.
6. **Migración de bloques a tablas reales**: crea `rooms`, `guests`, `stays`, `bookings`, `tickets`, `events`, `salones`, `expenses`, `hotel_status`, traspasa todos los datos que hubiera en `hotelops_kv`, y configura los permisos por rol en cada tabla nueva.

**Recomendación**: la próxima vez que se toque la base de datos, guarda el SQL ejecutado en el repositorio (carpeta `/sql`, un archivo por cambio, con fecha) en lugar de que solo exista en un chat. Así queda como historial real del proyecto.

---

## 6. Edge Functions (funciones servidor)

Viven en `supabase/functions/`. Se despliegan manualmente desde el panel de Supabase (Edge Functions → Deploy), no se despliegan solas con el resto del código.

### `reset-password`
Permite a un administrador cambiar la contraseña de otra cuenta sin depender del envío de emails (que no está configurado). Verifica en el servidor que quien llama es admin antes de actuar.

### `download-backup`
Genera la copia de seguridad completa (todas las tablas `hotelops_kv` + `audit_log`) solo si:
1. Quien llama tiene una sesión válida y rol `admin` (comprobado en el servidor, no en el navegador).
2. La contraseña enviada coincide con el secreto `BACKUP_PASSWORD` configurado en Supabase (Edge Functions → Secrets) — **la contraseña nunca vive en el código del navegador**.

**Si necesitas cambiar la contraseña de la copia de seguridad**: Supabase → Edge Functions → Secrets → edita `BACKUP_PASSWORD`. No hace falta volver a desplegar código.

---

## 7. Variables y claves de configuración

- **URL de Supabase** y **clave pública (`publishable key`)**: están escritas directamente en `src/supabaseClient.js`. Esto es normal y seguro para Supabase (la seguridad real la dan las políticas RLS, no el secreto de esta clave).
- **Claves realmente sensibles** (`SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSWORD`) nunca están en el código — solo existen como variables de entorno dentro de las Edge Functions, en el panel de Supabase.

---

## 8. Continuidad — cosas a vigilar con el tiempo

- **Plan gratuito de Supabase**: si el proyecto no recibe ninguna petición durante 7 días seguidos, Supabase lo pausa automáticamente y hay que reactivarlo a mano desde el panel. Mientras el personal entre a diario (como es la norma actual), no debería pasar — pero si alguna vez hay una parada larga del hotel, vale la pena entrar aunque sea una vez para mantenerlo activo, o valorar pasar a un plan de pago.
- **Dominio**: la app vive en un subdominio gratuito de Vercel (`masbo.vercel.app`). Conectar un dominio propio (`app.masboronat.com`, por ejemplo) daría más independencia y una imagen más profesional.
- **Sin backups automáticos**: la copia de seguridad depende de que alguien pulse el botón manualmente (Administrador → Estado del hotel). No hay un backup periódico automático.
- **Un único archivo grande**: `App.jsx` concentra casi todos los módulos. Funciona, pero dificulta que otra persona lo edite cómodamente en el futuro. Dividirlo por módulos sería una limpieza recomendable si el proyecto sigue creciendo.
- **Sin pruebas automáticas**: cada cambio se verifica compilando y probando manualmente. No hay ninguna red de seguridad que avise si algo se rompe fuera de lo que se está mirando en ese momento.

---

## 9. Cómo hacer cambios de forma segura

1. Nunca se edita directamente en producción: los cambios se hacen en el código, se verifica que compila (`npx tsc --noEmit ...` sobre los archivos `.jsx`), y solo entonces se sube a GitHub.
2. Los cambios de base de datos siempre usan `create or replace` / `if not exists`, para poder re-ejecutarse sin romper nada si hay dudas de si ya se aplicaron.
3. Antes de un cambio grande, descarga una copia de seguridad manual como red de seguridad.
