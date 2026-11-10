# Stella Maris Joyas — Stock y ventas

Sistema de stock y ventas del local de Av. Libertador San Martín 2038, Caseros.
Cada pieza es única: se carga con foto, se vende (o se reserva con seña) y queda registrada en el ticket del día.

**Para subirlo a internet:** ver [README_RAILWAY.md](README_RAILWAY.md).

## Qué hace

- **Stock:** grilla con foto, filtros por categoría y material, búsqueda por código.
- **Vender:** medio de pago (efectivo, débito, crédito, transferencia, Mercado Pago) y **Deshacer** el mismo día.
- **Reservas:** nombre de la clienta y seña; al venderla se descuenta la seña.
- **Por completar:** se suben muchas fotos juntas y después se completan de a una (material, tipo, precio). Al guardar, la pieza recibe su código (`ORO-020`, `PLA-031`…).
- **Ventas:** ticket del día y resumen de la semana.
- **Ingreso:** una cuenta compartida. La clave se valida en el servidor (bcrypt) y la sesión usa JWT.

## Estructura

```
server.js      API (Express) + sirve la carpeta public/
db.js          conexión MySQL, creación de tablas, cuenta del local
ejemplo.js     datos de prueba
seed.js        reinicia la base con los datos de prueba
schema.sql     estructura de las tablas (solo referencia: el servidor las crea solo)
public/        la app: index.html, styles.css, app.js, img/
```

Las fotos se guardan **en la base** (no en disco), así no se pierden cuando Railway reinicia.

## Correrlo en tu compu (XAMPP)

1. Prendé **MySQL** en XAMPP.
2. En la carpeta del proyecto:
   ```
   npm install
   cp .env.example .env      (en Windows: copy .env.example .env)
   ```
3. Editá `.env` (usuario/clave de MySQL, `LOGIN_PASSWORD`, `JWT_SECRET`).
4. `npm start` → abrí http://localhost:3000

La base y las tablas se crean solas. Con `DATOS_EJEMPLO=true` carga piezas de prueba si está vacía.

Para borrar todo y volver a los datos de prueba: `npm run seed -- --si`
(no toca la cuenta; sin `--si` no hace nada).

## API

Todas menos `/api/health`, `/api/login` y `/api/fotos/:clave` piden `Authorization: Bearer <token>`.

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/health` | chequeo del servidor |
| POST | `/api/login` | `{usuario, password, recordar}` → token (30 días con recordar, si no 12 h) |
| GET | `/api/estado` | stock, por completar, ventas de hoy, semana |
| POST | `/api/piezas/:codigo/vender` | `{medio}` |
| POST | `/api/ventas/:id/deshacer` | anula una venta del día |
| POST | `/api/piezas/:codigo/reserva` | `{cliente, sena}` |
| DELETE | `/api/piezas/:codigo/reserva` | quita la reserva |
| PATCH | `/api/piezas/:codigo` | `{nombre, precio, categoria, detalle}` |
| PUT | `/api/piezas/:codigo/foto` | cambia la foto (imagen en el cuerpo) |
| POST | `/api/pendientes` | sube una foto por completar |
| PATCH | `/api/pendientes/:id` | guarda datos; con material, tipo y precio pasa al stock |
| DELETE | `/api/pendientes/:id` | la borra (se puede restaurar 2 días) |
| POST | `/api/pendientes/:id/restaurar` | deshace el borrado |
| GET | `/api/fotos/:clave` | la imagen |

## Seguridad

- Clave con bcrypt; la sesión se invalida sola si se cambia `LOGIN_PASSWORD`.
- Máximo 8 intentos fallidos de ingreso cada 15 minutos por IP.
- Encabezados de seguridad (CSP, anti-iframe, HSTS en producción).
- Solo se sirve `public/`: el código del servidor y el `.env` no son accesibles desde el navegador.
- Las fotos se verifican por contenido (JPG, PNG, WebP), no por extensión.
