/**
 * Datos de ejemplo para mostrar el sistema funcionando (los mismos de la demo).
 * Se cargan solos con DATOS_EJEMPLO=true si la base está vacía, o a mano con `npm run seed`.
 */

/* Piezas en stock: código, nombre, material, categoría, precio, detalle, días desde que ingresó */
const STOCK = [
  ['ORO-001', 'Anillo Solitario Circón', 'oro', 'anillo', 640000, 'Talle 14, 2,6 g', 62],
  ['ORO-002', 'Alianza Clásica 4 mm', 'oro', 'anillo', 520000, 'Talle 18, 3,4 g', 120],
  ['ORO-003', 'Cadena Groumet 50 cm', 'oro', 'cadena', 1850000, '50 cm, 12,1 g', 35],
  ['ORO-004', 'Cadena Veneciana 45 cm', 'oro', 'cadena', 980000, '45 cm, 6,3 g', 18],
  ['ORO-005', 'Aros Argolla Mediana', 'oro', 'aros', 460000, '18 mm, 2,9 g', 44],
  ['ORO-006', 'Colgante Corazón Calado', 'oro', 'colgante', 310000, '1,9 g', 9],
  ['ORO-007', 'Pulsera Eslabón Grueso', 'oro', 'pulsera', 1420000, '19 cm, 9,2 g', 27],
  ['ORO-008', 'Aros Pasantes Bebé', 'oro', 'aros', 145000, 'Con traba, 0,9 g', 5],
  ['PLA-001', 'Anillo Corona Circones', 'plata', 'anillo', 38000, 'Talle 15', 14],
  ['PLA-002', 'Anillo Doble Banda', 'plata', 'anillo', 29000, 'Talle 17', 51],
  ['PLA-003', 'Cadena Rolo 45 cm', 'plata', 'cadena', 34000, '45 cm', 22],
  ['PLA-004', 'Cadena Fígaro 50 cm', 'plata', 'cadena', 48000, '50 cm', 73],
  ['PLA-005', 'Pulsera Dijes Corazón', 'plata', 'pulsera', 56000, '18 cm, 3 dijes', 3],
  ['PLA-006', 'Aros Gota con Piedra', 'plata', 'aros', 31000, 'Piedra blanca', 11],
  ['PLA-007', 'Aros Abridores Lisos', 'plata', 'aros', 18000, '10 mm', 39],
  ['PLA-008', 'Colgante Luna Creciente', 'plata', 'colgante', 24000, '2,5 cm', 7],
  ['ACE-001', 'Anillo Liso Pulido', 'acero', 'anillo', 9500, 'Talle 20', 90],
  ['ACE-002', 'Cadena Cubana 55 cm', 'acero', 'cadena', 19000, '55 cm, 6 mm', 16],
  ['ACE-003', 'Pulsera Malla Milanesa', 'acero', 'pulsera', 15500, 'Ajustable', 30],
  ['ACE-004', 'Aros Clip Geométricos', 'acero', 'aros', 11000, 'Hexagonales', 12],
  ['ACE-005', 'Colgante Cruz Texturada', 'acero', 'colgante', 12500, '3 cm', 58],
  ['ACE-006', 'Reloj Clásico Malla Acero', 'acero', 'reloj', 89000, 'Caja 40 mm', 20],
  ['ACE-007', 'Reloj Dama Malla Dorada', 'acero', 'reloj', 76000, 'Caja 28 mm, baño dorado', 4],
  ['PYO-001', 'Anillo Bicolor Entrelazado', 'plata-oro', 'anillo', 95000, 'Talle 16', 25],
  ['PYO-002', 'Pulsera Doble Tono', 'plata-oro', 'pulsera', 138000, '19 cm', 41],
  ['PYO-003', 'Aros Combinados', 'plata-oro', 'aros', 72000, 'Abridor', 8],
  ['PYO-004', 'Colgante Infinito Bicolor', 'plata-oro', 'colgante', 64000, '2 cm', 15],
];

/* Reservas: cliente, seña y hace cuántos días */
const RESERVAS = {
  'ORO-004': ['Laura G.', 200000, 6],
  'ORO-007': ['Martín R.', 300000, 2],
  'PLA-006': ['Sofía P.', 0, 1],
};

/* Ventas: hace cuántos días, hora, código, nombre, material, categoría, precio y medio de pago */
const VENTAS = [
  [0, '10:15', 'PLA-012', 'Cadena Espiga 40 cm', 'plata', 'cadena', 36000, 'Efectivo'],
  [0, '11:42', 'ORO-012', 'Aros Botón Circón', 'oro', 'aros', 395000, 'Transferencia'],
  [0, '12:30', 'ACE-009', 'Pulsera Cadena Doble', 'acero', 'pulsera', 14000, 'Mercado Pago'],
  [0, '13:05', 'PLA-015', 'Anillo Cinta Ondulada', 'plata', 'anillo', 27000, 'Débito'],
  [0, '14:10', 'ORO-010', 'Colgante Estrella', 'oro', 'colgante', 280000, 'Crédito'],
  [0, '14:48', 'PYO-006', 'Cadena Bicolor Trenzada', 'plata-oro', 'cadena', 118000, 'Transferencia'],
  [0, '15:32', 'PLA-020', 'Pulsera Tennis Circones', 'plata', 'pulsera', 62000, 'Efectivo'],
  [1, '11:05', 'ORO-018', 'Alianza Clásica 3 mm', 'oro', 'anillo', 480000, 'Transferencia'],
  [1, '12:40', 'PYO-008', 'Pulsera Doble Tono Fina', 'plata-oro', 'pulsera', 126000, 'Crédito'],
  [1, '15:10', 'PLA-017', 'Anillo Doble Banda Fino', 'plata', 'anillo', 26000, 'Efectivo'],
  [1, '16:25', 'ACE-012', 'Reloj Clásico Cuero', 'acero', 'reloj', 98000, 'Débito'],
  [1, '17:50', 'PLA-018', 'Colgante Corazón Plata', 'plata', 'colgante', 22000, 'Mercado Pago'],
  [1, '18:30', 'ORO-019', 'Aros Pasantes Corazón', 'oro', 'aros', 108000, 'Efectivo'],
  [2, '10:50', 'ORO-017', 'Cadena Groumet 45 cm', 'oro', 'cadena', 1380000, 'Transferencia'],
  [2, '13:15', 'PLA-014', 'Pulsera Tennis Fina', 'plata', 'pulsera', 64000, 'Crédito'],
  [2, '16:00', 'ACE-011', 'Colgante Ancla', 'acero', 'colgante', 14000, 'Efectivo'],
  [2, '18:05', 'PLA-016', 'Aros Perla', 'plata', 'aros', 32000, 'Débito'],
  [3, '11:30', 'ORO-015', 'Colgante Medalla Virgen', 'oro', 'colgante', 420000, 'Efectivo'],
  [3, '12:55', 'ORO-016', 'Anillo Solitario Fino', 'oro', 'anillo', 760000, 'Crédito'],
  [3, '16:40', 'PLA-013', 'Cadena Fígaro 45 cm', 'plata', 'cadena', 46000, 'Mercado Pago'],
  [3, '17:20', 'PYO-007', 'Aros Bicolor Gota', 'plata-oro', 'aros', 94000, 'Transferencia'],
  [4, '10:35', 'ORO-014', 'Aros Argolla Grande', 'oro', 'aros', 690000, 'Transferencia'],
  [4, '15:45', 'PLA-011', 'Aros Argolla Chica', 'plata', 'aros', 28000, 'Efectivo'],
  [4, '18:10', 'ACE-010', 'Reloj Dama Clásico', 'acero', 'reloj', 62000, 'Débito'],
  [5, '11:15', 'ORO-011', 'Cadena Veneciana 50 cm', 'oro', 'cadena', 980000, 'Transferencia'],
  [5, '14:20', 'PYO-005', 'Anillo Bicolor Liso', 'plata-oro', 'anillo', 112000, 'Crédito'],
  [5, '17:35', 'PLA-010', 'Pulsera Dijes Luna', 'plata', 'pulsera', 58000, 'Efectivo'],
  [6, '11:20', 'ORO-009', 'Anillo Sello Grabado', 'oro', 'anillo', 520000, 'Transferencia'],
  [6, '15:05', 'PLA-009', 'Cadena Rolo 50 cm', 'plata', 'cadena', 48000, 'Efectivo'],
  [6, '17:45', 'ACE-008', 'Reloj Sport Malla Caucho', 'acero', 'reloj', 72000, 'Mercado Pago'],
];

async function cargarEjemplo(conn) {
  for (const [codigo, nombre, material, categoria, precio, detalle, dias] of STOCK) {
    const r = RESERVAS[codigo];
    await conn.query(
      `INSERT INTO piezas (codigo, nombre, material, categoria, precio, detalle, estado, ingreso, reserva_cliente, reserva_sena, reserva_fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE() - INTERVAL ? DAY, ?, ?, ${r ? 'CURDATE() - INTERVAL ? DAY' : 'NULL'})`,
      [codigo, nombre, material, categoria, precio, detalle, r ? 'reservado' : 'disponible', dias, ...(r ? [r[0], r[1], r[2]] : [null, null])]);
  }
  for (const [hace, hora, codigo, nombre, material, categoria, precio, medio] of VENTAS) {
    const [p] = await conn.query(
      `INSERT INTO piezas (codigo, nombre, material, categoria, precio, estado, ingreso)
       VALUES (?, ?, ?, ?, ?, 'vendido', CURDATE() - INTERVAL ? DAY)`,
      [codigo, nombre, material, categoria, precio, hace + 30]);
    await conn.query(
      `INSERT INTO ventas (pieza_id, codigo, nombre, material, categoria, precio, medio_pago, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, TIMESTAMP(CURDATE() - INTERVAL ? DAY, ?))`,
      [p.insertId, codigo, nombre, material, categoria, precio, medio, hace, hora + ':00']);
  }
}

module.exports = { cargarEjemplo };
