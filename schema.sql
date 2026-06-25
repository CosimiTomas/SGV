-- ============================================================
-- SGV — Sistema de Gestión de Vacunas
-- CAPS San José Obrero · Hurlingham
-- Esquema de base de datos MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS sgv_caps
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sgv_caps;

-- Limpieza (orden inverso por dependencias)
DROP TABLE IF EXISTS movimientos;
DROP TABLE IF EXISTS lotes;
DROP TABLE IF EXISTS vacunas;
DROP TABLE IF EXISTS usuarios;

-- ------------------------------------------------------------
-- USUARIOS (RF05 — 4 perfiles con permisos diferenciados)
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  correo        VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol           ENUM('enfermeria','coordinadora','jefa','proveedora') NOT NULL,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- VACUNAS (catálogo — lista real provista por el CAPS)
-- ------------------------------------------------------------
CREATE TABLE vacunas (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL UNIQUE,
  dosis_por_frasco INT NOT NULL DEFAULT 1,
  activa           TINYINT(1) NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------
-- LOTES (RF04 — ingreso de lote nuevo)
-- ------------------------------------------------------------
CREATE TABLE lotes (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  vacuna_id         INT NOT NULL,
  numero_lote       VARCHAR(60) NOT NULL,
  vencimiento       DATE NOT NULL,
  cantidad_inicial  INT NOT NULL,
  disponible        INT NOT NULL,
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lote_vacuna FOREIGN KEY (vacuna_id) REFERENCES vacunas(id),
  CONSTRAINT chk_cantidad CHECK (cantidad_inicial > 0),
  CONSTRAINT chk_disponible CHECK (disponible >= 0)
);

-- ------------------------------------------------------------
-- MOVIMIENTOS (RF01 aplicación · RF03 descarte · RF04 ingreso)
-- ------------------------------------------------------------
CREATE TABLE movimientos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tipo            ENUM('aplicacion','descarte','ingreso') NOT NULL,
  vacuna_id       INT NOT NULL,
  lote_id         INT NOT NULL,
  cantidad        INT NOT NULL,
  motivo          VARCHAR(120) NULL,          -- solo descartes
  fecha_aplicacion DATE NULL,                 -- solo aplicaciones
  fecha_mov       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id      INT NOT NULL,
  CONSTRAINT fk_mov_vacuna  FOREIGN KEY (vacuna_id)  REFERENCES vacunas(id),
  CONSTRAINT fk_mov_lote    FOREIGN KEY (lote_id)    REFERENCES lotes(id),
  CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT chk_mov_cantidad CHECK (cantidad > 0)
);

-- ------------------------------------------------------------
-- ÍNDICES
-- ------------------------------------------------------------
CREATE INDEX idx_lotes_vacuna ON lotes(vacuna_id);
CREATE INDEX idx_lotes_venc   ON lotes(vencimiento);
CREATE INDEX idx_mov_tipo     ON movimientos(tipo);
CREATE INDEX idx_mov_fecha    ON movimientos(fecha_mov);

-- ============================================================
-- DATOS SEMILLA
-- ============================================================

-- Usuarios: las contraseñas reales se insertan desde seed.js (con hash bcrypt).
-- Acá quedan documentadas las cuentas; seed.js las crea con su hash.

-- Catálogo de vacunas (lista real del CAPS).
-- Las que vienen en frascos multidosis llevan dosis_por_frasco > 1.
INSERT INTO vacunas (nombre, dosis_por_frasco) VALUES
  ('Antigripal adyuvantada',                    1),
  ('Antigripal trivalente adultos',             1),
  ('Antigripal trivalente pediátrica',          1),
  ('Antimeningocócica tetravalente conjugada',  1),
  ('Doble bacteriana (dT)',                    10),
  ('Doble viral (SR)',                          1),
  ('Hepatitis A',                               1),
  ('Hepatitis B',                              10),
  ('Neumococo conjugada VCN 20',                1),
  ('Quíntuple',                                 1),
  ('Rotavirus monovalente',                     1),
  ('Salk',                                      5),
  ('Tetravalente contra el Dengue',             1),
  ('Triple bacteriana acelular (dTpa)',        10),
  ('Triple viral (SRP)',                        1),
  ('VPH nonavalente',                           1),
  ('Varicela',                                  1),
  ('Virus Sincicial Respiratorio',              1);
