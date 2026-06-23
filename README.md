# SGV — Deploy a Railway

Guía paso a paso para subir el Sistema de Gestión de Vacunas a Railway.

---

## Cambios respecto a la versión local

| Archivo | Qué cambió |
|---|---|
| `server.js` | Lee variables `MYSQL*` (Railway) o `DB_*` (local). Hace bootstrap del esquema al arrancar (crea tablas + catálogo de vacunas si no existen). Auto-seed opcional de usuarios con `SEED_ON_BOOT=true`. `listen` ahora bindea a `0.0.0.0`. |
| `seed.js` | También acepta variables `MYSQL*`. |
| `package.json` | Agrega `engines.node >= 18`. |
| `railway.json` | Nuevo. Define builder, start command, healthcheck en `/api/health` y restart policy. |
| `.env.example` | Documenta ambas convenciones. |
| `.gitignore` | Nuevo. |

No hace falta correr `schema.sql` a mano: el server lo crea solo al arrancar.

---

## Pasos

### 1. Subir el código a GitHub

```bash
cd sgv
git init
git add .
git commit -m "SGV: versión Railway"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/sgv-caps.git
git push -u origin main
```

### 2. Crear el proyecto en Railway

1. Entrar a [railway.com/new](https://railway.com/new) e iniciar sesión con GitHub.
2. Elegir **Deploy from GitHub repo** y seleccionar `sgv-caps`.
3. Railway detecta Node.js automáticamente y empieza a buildear. Va a fallar el primer arranque porque todavía no hay base de datos — es normal.

### 3. Agregar MySQL al proyecto

1. En el dashboard del proyecto, click en **+ Create** → **Database** → **Add MySQL**.
2. Railway provisiona el servicio y genera las variables `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` automáticamente.

### 4. Vincular las variables al servicio web

En el servicio del SGV (no en el de MySQL), ir a **Variables** y agregar referencias al servicio MySQL:

```
MYSQLHOST=${{ MySQL.MYSQLHOST }}
MYSQLPORT=${{ MySQL.MYSQLPORT }}
MYSQLUSER=${{ MySQL.MYSQLUSER }}
MYSQLPASSWORD=${{ MySQL.MYSQLPASSWORD }}
MYSQLDATABASE=${{ MySQL.MYSQLDATABASE }}
```

> Si el servicio MySQL en Railway aparece con otro nombre, reemplazar `MySQL` por el nombre real.

Agregar además:

```
JWT_SECRET=<un string largo y aleatorio, p. ej. salida de `openssl rand -hex 32`>
SEED_ON_BOOT=true
```

`SEED_ON_BOOT=true` hace que en el primer arranque se creen los 4 usuarios (enfermeria, coordinacion, jefa, proveedora). **Después del primer deploy exitoso, cambiar a `false`** para que no intente reseedar.

### 5. Redeploy

Railway redeploya solo al guardar variables. Mirar los logs del servicio: tendría que aparecer

```
› Verificando esquema de base de datos…
✓ Esquema listo.
  SGV en ejecución  ->  puerto XXXX
```

### 6. Generar el dominio público

En el servicio del SGV → **Settings** → **Networking** → **Generate Domain**.

Eso devuelve una URL tipo `sgv-caps-production.up.railway.app`. Abrirla y entrar con cualquiera de los 4 usuarios:

| Usuario | Contraseña | Rol |
|---|---|---|
| `enfermeria@caps.gob.ar` | `enfermeria123` | enfermeria |
| `coordinacion@caps.gob.ar` | `coordinacion123` | coordinadora |
| `jefa@caps.gob.ar` | `jefa123` | jefa |
| `proveedora@caps.gob.ar` | `proveedora123` | proveedora |

### 7. (Opcional) Cargar lotes de ejemplo

Si querés también los lotes de prueba del `seed.js`, instalar la CLI de Railway y correr:

```bash
npm i -g @railway/cli
railway login
railway link        # elegir el proyecto
railway run npm run seed
```

> **Atención:** `seed.js` borra todo lo previo en `usuarios`, `lotes` y `movimientos`. Sólo correr en bases vacías o de prueba.

---

## Cómo seguir trabajando local con XAMPP

Nada cambia. El `.env` local sigue usando `DB_HOST`, `DB_USER`, etc. El server detecta cuál convención está disponible y usa la que corresponda.

---

## Troubleshooting

**El deploy falla con `ECONNREFUSED` en el log:**
las variables `MYSQL*` no están vinculadas. Revisar el paso 4.

**Login dice "Correo o contraseña incorrectos" después del primer deploy:**
`SEED_ON_BOOT` no estaba en `true` cuando arrancó por primera vez. Ponerlo en `true`, redeploy, esperar el log "Creando usuarios iniciales", y después volver a `false`.

**Quiero resetear todo:**
en el servicio MySQL → **Data** → eliminar los registros o dropear las tablas. Al próximo arranque del SGV se vuelven a crear vacías.
