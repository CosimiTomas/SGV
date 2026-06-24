# SGV — Sistema de Gestión de Vacunas
### CAPS San José Obrero · Hurlingham · Equipo N° 01 (ILM)

Aplicación full stack para el control interno del stock de vacunas del Centro de Atención Primaria de la Salud (CAPS) San José Obrero, Hurlingham. Cubre el flujo completo de trazabilidad de un lote desde su ingreso hasta su aplicación o descarte, con alertas operativas y control de acceso por rol.

---

## El problema que resuelve

En el CAPS, cada vacuna aplicada se anota hoy en tres registros paralelos: la Hoja 10 interna, la Historia Clínica del paciente, y los sistemas nacionales NOMIVAC/SISA. Ninguno de los tres da en tiempo real una respuesta a preguntas básicas de gestión: ¿cuántas dosis quedan de cada vacuna?, ¿qué lotes están por vencerse?, ¿cuándo conviene pedir reposición?

El SGV no reemplaza a esos registros — son obligatorios y externos al CAPS. Lo que hace es cubrir el **vacío de control interno de stock**: lleva el inventario por lote, descuenta automáticamente las aplicaciones y descartes, y avisa cuándo algo está por vencer o cuándo el stock baja del umbral acordado con enfermería.

---

## Alcance

**Incluye:**
- Ingreso de lotes nuevos (vacuna, número de lote, vencimiento, cantidad).
- Registro de aplicaciones, con descuento automático del stock.
- Registro de descartes (con motivo).
- Consulta de stock en vivo, con estado calculado (OK / stock bajo / por vencer).
- Dashboard con KPIs y alertas operativas.
- Historial completo de movimientos con filtro por tipo.
- Gestión de usuarios (alta, baja, reset de contraseña) por la coordinadora.
- Autenticación con cuatro perfiles y permisos diferenciados.

**No incluye (fuera de alcance, definido con la clienta):**
- Sincronización con la Historia Clínica del municipio (sin acceso técnico).
- Sincronización con NOMIVAC / SISA (sistemas nacionales, no municipales).
- Reemplazo de la Hoja 10.

---

## Requerimientos funcionales

| RF | Caso de uso | Vista (Frontend) | Endpoint (Backend) |
|---|---|---|---|
| RF01 | CU03 — Registrar aplicación | Registrar aplicación | `POST /api/aplicaciones` |
| RF02 | CU04 — Alertas operativas | Dashboard | `GET /api/dashboard` |
| RF03 | — Registrar descarte | Registrar descarte | `POST /api/descartes` |
| RF04 | CU02 — Ingresar lote | Ingresar lote | `POST /api/lotes` |
| RF05 | CU01 — Autenticación + control de roles | Login | `POST /api/login` |
| RF07 | CU04 — Consulta de stock | Stock | `GET /api/stock` |
| RF08 | — Historial de movimientos | Historial | `GET /api/movimientos` |

**Trazabilidad:** cada RF tiene un caso de uso, una pantalla validada con la clienta, una vista codificada, una tabla y un endpoint. El flujo de integración va de punta a punta: ningún dato del frontend está hardcodeado.

---

## Reglas de negocio

Definidas con Mariana Touzon (Lic. en Enfermería) durante el relevamiento:

- **Stock bajo:** un lote queda marcado como "stock bajo" cuando le quedan **6 dosis o menos** disponibles.
- **Por vencer:** un lote queda marcado como "por vencer" cuando el vencimiento es a **15 días o menos** desde hoy.
- **Prioridad de alertas:** si un lote cumple las dos condiciones, prevalece "por vencer".
- **Umbral global:** las 6 dosis aplican a todas las vacunas por igual (decisión explícita de la clienta para no complicar la operación con umbrales por vacuna).
- **Sin stock negativo:** una aplicación o descarte nunca puede dejar el disponible debajo de cero. Se valida en el servidor con `FOR UPDATE` dentro de transacción.

---

## Roles y permisos

Cuatro perfiles, cada uno con sus permisos. La validación de permisos se hace **en el servidor**: aunque el frontend oculte botones según el rol, el backend rechaza con HTTP 403 cualquier acción no autorizada.

| Rol | Lectura | Escritura de stock | Gestión de usuarios |
|---|:-:|:-:|:-:|
| **Enfermería** | ✓ | ✓ | — |
| **Coordinadora** | ✓ | — | ✓ |
| **Jefa** | ✓ | — | — |
| **Proveedora** | ✓ | — | — |

> "Escritura de stock" = ingresar lote, registrar aplicación, registrar descarte.
> Por decisión de la clienta, la gestión de usuarios recae en la **coordinadora**, no en la jefa.

---

## Catálogo de vacunas

18 vacunas, lista real provista por el CAPS:

Antigripal adyuvantada · Antigripal trivalente adultos · Antigripal trivalente pediátrica · Antimeningocócica tetravalente conjugada · Doble bacteriana (dT) · Doble viral (SR) · Hepatitis A · Hepatitis B · Neumococo conjugada VCN 20 · Quíntuple · Rotavirus monovalente · Salk · Tetravalente contra el Dengue · Triple bacteriana acelular (dTpa) · Triple viral (SRP) · VPH nonavalente · Varicela · Virus Sincicial Respiratorio.

---

## Pantallas

| Pantalla | Quién la ve | Qué hace |
|---|---|---|
| **Login** | Todos | Autenticación con correo + contraseña. Devuelve un JWT firmado con el rol. |
| **Dashboard** | Todos | KPIs (tipos de vacuna con stock, unidades totales, lotes con stock bajo, lotes por vencer) + listas de alertas. |
| **Stock** | Todos | Tabla de lotes con vacuna, número de lote, vencimiento, cantidad inicial, disponible y estado calculado (OK / stock bajo / por vencer). |
| **Ingresar lote** | Enfermería | Formulario para cargar un lote nuevo. Valida que la fecha de vencimiento no sea anterior a hoy y que la cantidad sea positiva. |
| **Registrar aplicación** | Enfermería | Selección de vacuna → lote → cantidad → fecha. Descuenta del disponible dentro de transacción. |
| **Registrar descarte** | Enfermería | Igual al anterior pero con motivo obligatorio (vencido, rotura, falla de cadena de frío, etc.). |
| **Historial** | Todos | Últimos 200 movimientos con filtro por tipo (ingreso / aplicación / descarte). |
| **Usuarios** | Coordinadora | Alta de usuario, activar/desactivar, resetear contraseña. |

---

## Modelo de datos

Cuatro tablas en MySQL con relaciones por clave foránea:

```
usuarios       (id, correo, password_hash, rol, activo, creado_en)
vacunas        (id, nombre, activa)
lotes          (id, vacuna_id→vacunas, numero_lote, vencimiento,
                cantidad_inicial, disponible, creado_en)
movimientos    (id, tipo, vacuna_id→vacunas, lote_id→lotes,
                cantidad, motivo, fecha_aplicacion, fecha_mov,
                usuario_id→usuarios)
```

**Decisiones de diseño:**

- **`tipo` en `movimientos`** es un ENUM con tres valores (`ingreso`, `aplicacion`, `descarte`). Una sola tabla unifica el historial.
- **`disponible` en `lotes`** se mantiene materializado (no se recalcula desde movimientos cada vez). Cada aplicación o descarte lo decrementa dentro de una transacción con `FOR UPDATE`, garantizando que dos operaciones simultáneas no dejen el stock inconsistente.
- **Constraints CHECK** previenen cantidades inválidas a nivel de base: `cantidad_inicial > 0`, `disponible >= 0`, `cantidad > 0`.
- **`motivo`** y **`fecha_aplicacion`** son `NULL` por defecto: solo el descarte usa la primera, solo la aplicación usa la segunda.
- **Índices** en `lotes(vacuna_id)`, `lotes(vencimiento)`, `movimientos(tipo)` y `movimientos(fecha_mov)` para que las consultas del dashboard y el historial sean rápidas.

---

## Seguridad

- **Contraseñas con hash bcrypt** (factor 10). En la base nunca se guarda el texto plano.
- **JWT** firmado con `JWT_SECRET`, expiración de 8 horas. Lleva `id`, `correo` y `rol` del usuario.
- **Validación de permisos en el servidor**, no solo en el frontend. Cada endpoint de escritura pasa por `requireAuth` + `requireRole`.
- **Transacciones** en todas las operaciones que tocan el stock (ingreso, aplicación, descarte), con bloqueo de fila (`SELECT ... FOR UPDATE`) para evitar condiciones de carrera.
- **Mensajes de error genéricos** en el login ("Correo o contraseña incorrectos") para no revelar si el correo existe o no.

---

## Stack

- **Backend:** Node.js 18+ con Express.
- **Base de datos:** MySQL 8 (compatible con MariaDB).
- **Autenticación:** JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`).
- **Driver DB:** `mysql2/promise` con pool de conexiones.
- **Frontend:** HTML + CSS + JavaScript vanilla, SPA sin framework, consumo de la API por `fetch`.
- **Identidad visual:** paleta del Municipio de Hurlingham (teal `#0FA99E` + lima `#A6CE39`), tipografía DM Sans.

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/login` | público | Autenticación, devuelve JWT |
| GET | `/api/me` | autenticado | Datos del usuario actual |
| GET | `/api/vacunas` | autenticado | Catálogo de vacunas activas |
| GET | `/api/vacunas/:id/lotes` | autenticado | Lotes disponibles de una vacuna |
| GET | `/api/stock` | autenticado | Stock actual con estado calculado |
| GET | `/api/dashboard` | autenticado | KPIs + alertas |
| GET | `/api/movimientos` | autenticado | Historial (filtro opcional `?tipo=`) |
| POST | `/api/lotes` | enfermería | Ingresar lote nuevo |
| POST | `/api/aplicaciones` | enfermería | Registrar aplicación |
| POST | `/api/descartes` | enfermería | Registrar descarte |
| GET | `/api/usuarios` | coordinadora | Listar usuarios |
| POST | `/api/usuarios` | coordinadora | Crear usuario |
| PATCH | `/api/usuarios/:id/estado` | coordinadora | Activar / desactivar |
| PATCH | `/api/usuarios/:id/password` | coordinadora | Resetear contraseña |
| GET | `/api/health` | público | Verificación de estado (uso interno) |

---

## Estructura del proyecto

```
sgv/
├── server.js              Backend completo: conexión MySQL, auth JWT, roles, rutas
├── seed.js                Carga inicial opcional de usuarios y lotes de ejemplo
├── schema.sql             Esquema de la base de datos (referencia)
├── index.html             Frontend — estructura de la SPA
├── styles.css             Frontend — estilos
├── app.js                 Frontend — lógica e integración con la API
├── package.json           Dependencias y scripts
├── railway.json           Configuración de deploy en Railway
├── .env.example           Plantilla de variables de entorno
├── README.md              Este documento
└── README_RAILWAY.md      Guía de deploy (separada)
```

---

## Usuarios iniciales

| Rol | Correo | Contraseña |
|---|---|---|
| Enfermería | `enfermeria@caps.gob.ar` | `enfermeria123` |
| Coordinadora | `coordinacion@caps.gob.ar` | `coordinacion123` |
| Jefa | `jefa@caps.gob.ar` | `jefa123` |
| Proveedora | `proveedora@caps.gob.ar` | `proveedora123` |

> Credenciales de demo, deben rotarse en producción.

---

## Equipo

**Equipo N° 01 — 7° Informática — Instituto Leonardo Murialdo (2026)**

| Integrante | Rol |
|---|---|
| More Aloia Touzon | Project Manager + Base de datos |
| Agustín Aloia Mircovich | Frontend 1 + Backend 2 |
| Tomás Cosimi | Backend 1 |
| Felipe Dellepiane | Frontend 2 + UX + Diseño multimedial |
| Mateo Scorza | ADO (documentación, presupuesto, análisis económico) |

**Clienta:** Lic. Mariana Touzon — Enfermería, CAPS San José Obrero (Hurlingham).
**Materia:** Evaluación de Proyectos — Profesores Pedaci y Lourdes.
