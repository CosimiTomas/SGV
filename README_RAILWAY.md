# Subir Stella Maris Joyas a Railway

Son unos 10 minutos. No hace falta tocar código.

## 1. Subir el proyecto a GitHub

1. En GitHub: **New repository** → nombre `stella-maris-stock` → **Private** → *Create repository*.
2. En el repo vacío: **uploading an existing file** (o *Add file → Upload files*).
3. Arrastrá **todo el contenido** de la carpeta descomprimida (no la carpeta en sí): `server.js`, `db.js`, `package.json`, la carpeta `public`, etc.
   - Si ves una carpeta `node_modules`, **no la subas**.
   - Asegurate de que `.gitignore` también se suba (en Mac/Windows a veces los archivos que empiezan con punto quedan ocultos).
4. **Commit changes**.

## 2. Crear el proyecto en Railway

1. Entrá a railway.com → **New Project** → **Deploy from GitHub repo** → elegí `stella-maris-stock`.
2. El primer deploy puede fallar porque todavía no hay base de datos. Es normal, seguí.

## 3. Agregar la base MySQL

En el proyecto: **+ Create** (o *New*) → **Database** → **MySQL**. Esperá a que quede en verde.

## 4. Cargar las variables

Entrá al servicio **stella-maris-stock** (no al de MySQL) → pestaña **Variables** → **Raw Editor** y pegá:

```
MYSQL_URL=${{ MySQL.MYSQL_URL }}
JWT_SECRET=escribí-acá-un-texto-largo-y-al-azar
LOGIN_USUARIO=stellamaris
LOGIN_PASSWORD=la-clave-que-van-a-usar-en-el-local
DATOS_EJEMPLO=true
```

- `MYSQL_URL` conecta con la base. Si tu servicio MySQL tiene otro nombre, cambiá `MySQL` por ese nombre.
- `JWT_SECRET`: cualquier texto largo (por ejemplo 40 letras y números al azar). Si falta, las sesiones se cierran cada vez que Railway reinicia.
- `LOGIN_PASSWORD`: es la clave de ingreso. **Sin esta variable no se crea la cuenta** y nadie puede entrar (a propósito, para que no quede una clave de prueba).
- `DATOS_EJEMPLO=true` carga 27 piezas y ventas de prueba si la base está vacía, para mostrarlo. Para el uso real, **no la pongas**. Si ya la usaste para una demo y querés empezar limpio: borrá la variable, eliminá el servicio MySQL, creá uno nuevo (paso 3) y volvé a desplegar.

Guardá → Railway vuelve a desplegar solo.

## 5. Generar el link

Servicio → **Settings** → **Networking** → **Generate Domain**. Ese link es el sistema; se puede guardar en el inicio del celular.

## 6. (Opcional) Chequeo de salud

Settings → **Healthcheck Path**: `/api/health`.

## Cambiar la clave

Cambiá `LOGIN_PASSWORD` en Variables. Al reiniciar, la clave nueva queda activa y **todas las sesiones abiertas se cierran**.

## Si algo falla

Mirá **Deployments → View logs**.

| Mensaje en los logs | Qué hacer |
|---|---|
| `Falta la variable LOGIN_PASSWORD` (y no deja entrar) | Cargá la variable del paso 4. |
| `ECONNREFUSED` o `ENOTFOUND` | `MYSQL_URL` mal escrita, o el nombre del servicio MySQL no coincide. |
| `Falta JWT_SECRET` (aviso) | Cargá `JWT_SECRET`; funciona igual, pero se cierran las sesiones al reiniciar. |
| La página dice *Application failed to respond* | Esperá a que el deploy termine; si sigue, revisá los logs. |

No hace falta `railway.json` ni Procfile: Railway detecta Node y usa `npm start`.
