-- Stella Maris Joyas — estructura de la base (solo referencia).
-- No hace falta importarlo: el servidor crea las tablas solo al arrancar.


CREATE TABLE IF NOT EXISTS `contadores` (
  `nombre` varchar(20) NOT NULL,
  `ultimo` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fotos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `clave` char(32) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `datos` mediumblob NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `clave` (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pendientes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero` int(10) unsigned NOT NULL,
  `foto_id` int(11) NOT NULL,
  `material` enum('oro','plata','acero','plata-oro') DEFAULT NULL,
  `categoria` enum('anillo','cadena','pulsera','aros','colgante','reloj') DEFAULT NULL,
  `precio` int(10) unsigned NOT NULL DEFAULT 0,
  `nombre` varchar(120) NOT NULL DEFAULT '',
  `detalle` varchar(200) NOT NULL DEFAULT '',
  `borrada_en` datetime DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_borrada` (`borrada_en`),
  KEY `fk_pend_foto` (`foto_id`),
  CONSTRAINT `fk_pend_foto` FOREIGN KEY (`foto_id`) REFERENCES `fotos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `piezas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(12) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `material` enum('oro','plata','acero','plata-oro') NOT NULL,
  `categoria` enum('anillo','cadena','pulsera','aros','colgante','reloj') NOT NULL,
  `precio` int(10) unsigned NOT NULL,
  `detalle` varchar(200) NOT NULL DEFAULT '',
  `estado` enum('disponible','reservado','vendido') NOT NULL DEFAULT 'disponible',
  `ingreso` date NOT NULL,
  `foto_id` int(11) DEFAULT NULL,
  `reserva_cliente` varchar(80) DEFAULT NULL,
  `reserva_sena` int(10) unsigned DEFAULT NULL,
  `reserva_fecha` date DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_estado` (`estado`),
  KEY `fk_pieza_foto` (`foto_id`),
  CONSTRAINT `fk_pieza_foto` FOREIGN KEY (`foto_id`) REFERENCES `fotos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario` varchar(60) NOT NULL,
  `password_hash` varchar(100) NOT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ventas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pieza_id` int(11) NOT NULL,
  `codigo` varchar(12) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `material` enum('oro','plata','acero','plata-oro') NOT NULL,
  `categoria` enum('anillo','cadena','pulsera','aros','colgante','reloj') NOT NULL,
  `precio` int(10) unsigned NOT NULL,
  `sena` int(10) unsigned NOT NULL DEFAULT 0,
  `medio_pago` varchar(20) NOT NULL,
  `fecha` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fecha` (`fecha`),
  KEY `fk_venta_pieza` (`pieza_id`),
  CONSTRAINT `fk_venta_pieza` FOREIGN KEY (`pieza_id`) REFERENCES `piezas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO contadores (nombre, ultimo) VALUES ('oro',0),('plata',0),('acero',0),('plata-oro',0),('foto',0);
