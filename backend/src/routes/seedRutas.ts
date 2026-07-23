import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { pool } from '../db/client.js';

export const seedRutasRouter = Router();

type ReqWithUser = { user?: { rol: string } };

// Datos del Excel — deduplicados con sus categorías combinadas
const TALLERES: [string, string, string, string[]][] = [
  // nombre, dirección, teléfono, categorías

  // ── A + B + C (Lun/Mié + Mar/Jue + Vie) ──────────────────────────────
  ['TURISMO TOTAL',              'HIPOLITO YRIGOYEN 824',                    '2604061635', ['A','B','C']],
  ['CARRICONDO OSVALDO ATILIO',  'BUCHARDO 30',                              '2604409525', ['A','B','C']],
  ['BARRERA JUAN CARLOS',        'CASTELLI 140',                             '2604268439', ['A','B','C']],
  ['MARIO CARRIZO',              'SALTA 887',                                '2604368615', ['A','B','C']],
  ['LUNA AGUSTIN',               '12 DE OCTUBRE 23',                        '2604684931', ['A','B','C']],
  ['MONTAÑA JORGE',              'ALEMANIA Y VENDIMIA',                      '2604012134', ['A','B','C']],
  ['TALLER SANTA FE',            'OLASCOAGA Y P. ALBARRACIN DE SARMIENTO',  '9999999999', ['A','B','C']],
  ['ORTEGA RAFAEL',              'MAZA 636',                                 '2604688698', ['A','B','C']],
  ['MOHAMED CRISTIAN',           'SEGOVIA 93',                               '2604417940', ['A','B','C']],
  ['ROMA AUTOMOTORES',           'CORDOBA 55',                               '9999999999', ['A','B','C']],
  ['LORENZO AUTOMOTORES',        'AV. MITRE 575',                            '5604658339', ['A','B','C']],

  // ── A + B (Lun/Mié + Mar/Jue) ─────────────────────────────────────────
  ['PAVEZ WALTER',               'AZOPARDO 974',                             '2604695689', ['A','B']],
  ['VICENTE BUENAMIGO',          'JULIO ARGENTINO ROCA 115',                 '2604319608', ['A','B']],

  // ── A only (Lun/Mié) ──────────────────────────────────────────────────
  ['JUAN PABLO (BOCHA)',          'BARRIO CRISTIANO',                        '9999999999', ['A']],
  ['NICO SPEZZANO',               'CUADRO NACIONAL',                         '9999999999', ['A']],
  ['GATICA MARIO',                'CERCA DE VICENTE BUENAMIGO',              '2604271180', ['A']],
  ['BUTTINI',                     'SARMIENTO CUADRO NACIONAL',               '2604000772', ['A']],
  ['RICARDO MARTINEZ (PALILLO)',  'BARCALA',                                 '2604999999', ['A']],
  ['RECHE ALBERTO',               'SANTA CRUZ 73',                           '2604632043', ['A']],
  ['ORLANDO PEDERNERA',           'FRENTE A RECHE',                          '2604999999', ['A']],
  ['ARIEL GIMENEZ',               'SEGURA 43',                               '2604373858', ['A']],
  ['LUNA JUAN ANTONIO',           'CHUBUT 198',                              '2604412880', ['A']],
  ['SOSA JUAN',                   'MISIONES',                                '2604999999', ['A']],
  ['SIDORUK MAXI',                'AV. ALBERDI 1629',                        '2604055444', ['A']],
  ['FALCO ROBERTO',               'FRAY LUIS BELTRAN 461',                   '9999999999', ['A']],
  ['SUAREZ MIGUEL (TUCU)',        'SUIPACHA 551',                            '2604397415', ['A']],
  ['CHAINE',                      'ARISTOBULO DEL VALLE 1016',               '2604999999', ['A']],
  ['LILLO MARTIN',                'ARISTOBULO DEL VALLE 1016',               '2604239252', ['A']],
  ['JULIAN CARBALLO',             'OLASCOAGA 1827',                          '2604999999', ['A']],
  ['NELSON DI TOTO',              'AV. MITRE 1557',                          '2604576588', ['A']],
  ['CRISTIAN GRAMAJO',            'TACUARI Y CORONAL CAMPO',                 '2604417500', ['A']],
  ['GUZMAN EMANUEL',              'TACUARI 615',                             '2604999999', ['A']],
  ['SOSA JORGE',                  'TACUARI 411',                             '2604023772', ['A']],
  ['POMELO',                      'MAZA ANTES DE LLEGAR A PICHINCHA',        '2604999999', ['A']],
  ['NANO ROLDAN',                 'MAZA 510',                                '2604999999', ['A']],
  ['CONTRERAS ADAN',              'AV. COLON CASI ESQUINA BARCALA',          '2604999999', ['A']],
  ['CLIMACAR',                    'BARCALA 742',                             '2604999999', ['A']],
  ['LOZANO DARIO',                'FRENTE A MOHAMED',                        '2604999999', ['A']],
  ['KEVIN ANDREOLA',              'EMILIO CIVIT 573',                        '2604413077', ['A']],
  ['HERMOSILLA JULIO',            'SARMIENTO 245',                           '2604604942', ['A']],
  ['HERNAN ORLANDO ARTILLO',      'BANDERA DE LOS ANDES 1035',               '2604999999', ['A']],
  ['GENTILE NESTOR',              'ENTRE RIOS 258',                          '2604082258', ['A']],
  ['JUAREZ HUGO - PONY',          'ENTRE RIOS 815',                          '9999999999', ['A']],

  // ── B only (Mar/Jue) ──────────────────────────────────────────────────
  ['BALMACEDA CARLOS DARIAN',             'WASHINGTON LENCINA 662',                  '2604024704', ['B']],
  ['MIGUEL DETAIL',                       'REPUBLICA DE SIRIA 254',                  '2604928052', ['B']],
  ['TALLER BELGRANO',                     'BELGRANO',                                '2604999999', ['B']],
  ['GARCIA FERNANDO',                     'PAUNERO 923',                             '2604698151', ['B']],
  ['SACABOLLO CRISTIAN (MICROBOLLO STILO)','LEONARDO DA VINCI',                      '2604040217', ['B']],
  ['GENTILE ALBERTO',                     'PAUNERO Y RODOLFO ISELIN',                '2604348916', ['B']],
  ['GONZALEZ MATIAS',                     'EINSTEIN 970',                            '2604012096', ['B']],
  ['BERNAOLA LUCAS',                      'LAVALLE 459',                             '2604615627', ['B']],
  ['DONOSO OSCAR',                        'ALSINAS ANTES DE LLEGAR A CASTELLI',      '2604598771', ['B']],
  ['LOYOLA DAVID',                        'CASTELLI 656',                            '2604052811', ['B']],
  ['FLACO ALSINA (CORIA)',                'ALSINA ANTES DE BS. AS.',                 '2604999999', ['B']],
  ['PEREZ IVAN SACABOLLOS',               'DAY 568',                                 '2604040217', ['B']],
  ['BARRERA JUAN CARLOS (RAWSON)',         'RAWSON 3015',                             '2604517554', ['B']],
  ['SBONA RAMON',                         'MORENO 883',                              '2604407346', ['B']],
  ['CORREA LUIS',                         'ALBORADA 1410',                           '2604662484', ['B']],
  ['FUENTE MIGUEL',                       'PUEYRREDON Y RICARDO ROJAS',              '2604999999', ['B']],
  ['MARTINEZ GUSTAVO (CHAPA)',            'LAS VIRGENES Y RAWSON',                   '2604038344', ['B']],
  ['JUAN MENDEZ',                         'TIERRA DE HUARPES',                       '2604999999', ['B']],
  ['LOPEZ FELIPE',                        'RAWSON CASI ESQUINA TIERRA DE HUARPES',   '2604999999', ['B']],
  ['TOLEDO LUIS',                         'PENDIENTE',                               '2604002841', ['B']],
  ['GENTILE GABRIEL',                     'ADOLFO CALLE / SARDI',                    '2604601973', ['B']],
  ['CASADO OMAR',                         'ADOLFO CALLE',                            '2604533524', ['B']],
  ['TABOADA MAXI',                        'NAMUNCURA',                               '2604021470', ['B']],
  ['DANTE ARRIGHI',                       'EL CERRITO',                              '2604999999', ['B']],
  ['BAIGORRIA WILLY',                     'GUTEMBERG Y PASAJE LAPRIDA',              '2604003049', ['B']],
  ['ADRIAN RAMIREZ',                      'FRENTE A COMERCIO',                       '2604999999', ['B']],
  ['CALDERON MARTIN',                     'URQUIZA 647',                             '2604517938', ['B']],
  ['HUGO GARCIA',                         'PASTEUR Y CORDOBA',                       '2604999999', ['B']],

  // ── D (Recorrido Andrés) ───────────────────────────────────────────────
  ['LOPEZ JAVIER (BEBO)',     'BALLOFET 1782',                    '9999999999', ['D']],
  ['TALAGUIRRE MATIAS',       'QUINTANA 2864',                    '9999999999', ['D']],
  ['ESCALANTE DANIEL',        'DAUDET Y LAS AMERICAS',            '2604224877', ['D']],
  ['SANCHEZ JESUS',           'CAPDEVILE 1450',                   '2604629852', ['D']],
  ['LUDUENA VECINO HARRY',    'ANGEL DIEZ MARTIN 1980',           '9999999999', ['D']],
  ['TOLEDO ATRAS DE JAQUE',   'LOS FRANCESES',                    '2604824172', ['D']],
  ['LOPEZ MARCELO',           'BALLOFET 1945',                    '2604330773', ['D']],
  ['QUIROGA FABIAN',          'BALLOFET 1700',                    '2604594251', ['D']],
  ['LACAZE OMAR',             'CAYETANO SILVA 1356',              '2604409190', ['D']],
  ['CESARETTI MARCELO',       'ANGEL DIEZ MARTIN 1755',           '2604387048', ['D']],
  ['FARINELLI ESTEBAN',       'ALVAREZ CONDARCO 280',             '2604845992', ['D']],
  ['CRISTIAN TALLER AMSAT',   'CARLOS WASHINGTON LENCINAS 670',   '2604418220', ['D']],
  ['ANGEL SEGOVIA',           'CASNATI 900',                      '2604019866', ['D']],
  ['CARRIZO JORGE',           'ALVAREZ CONDARCO 1065',            '2604354087', ['D']],
  ['BUCCA CARROCERIAS',       'CANGALLO 720',                     '2604811910', ['D']],
  ['CARRASCO ADRIAN',         'LOS PLATANOS 3082',                '2604644281', ['D']],
  ['QUIROGA ALEJANDRO',       'LOS FRANCESES 2028',               '2604312964', ['D']],
];

/**
 * POST /admin/seed/rutas
 * Carga todos los talleres del Excel (idempotente: no duplica si ya existen por nombre+dirección).
 * Solo admin.
 */
seedRutasRouter.post('/admin/seed/rutas', requireAuth, async (req, res) => {
  const user = (req as typeof req & ReqWithUser).user;
  if (user?.rol !== 'admin') {
    res.status(403).json({ error: 'Solo el administrador puede cargar los datos.' });
    return;
  }

  // Asegurar tabla con columna categorias
  await pool.query(`
    create table if not exists clientes (
      id text primary key,
      nombre text not null,
      direccion text not null,
      telefono text not null,
      pedido text not null,
      activo boolean not null default true,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table clientes add column if not exists tipo text not null default 'taller'`);
  await pool.query(`alter table clientes add column if not exists categorias text[] not null default '{}'`);

  let insertados = 0;
  let omitidos = 0;

  for (const [nombre, direccion, telefono, categorias] of TALLERES) {
    // Idempotente: omitir si ya existe un taller activo con mismo nombre y dirección
    const { rowCount } = await pool.query(
      `select 1 from clientes where lower(nombre) = lower($1) and lower(direccion) = lower($2) and activo = true limit 1`,
      [nombre, direccion]
    );
    if ((rowCount ?? 0) > 0) {
      omitidos++;
      continue;
    }
    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `insert into clientes (id, nombre, direccion, telefono, pedido, tipo, categorias, activo)
       values ($1, $2, $3, $4, '-', 'taller', $5, true)`,
      [id, nombre, direccion, telefono, categorias]
    );
    insertados++;
    // Pequeña pausa para IDs únicos
    await new Promise<void>((r) => setTimeout(r, 1));
  }

  res.json({
    ok: true,
    insertados,
    omitidos,
    total: TALLERES.length,
    mensaje: `${insertados} taller(es) cargados. ${omitidos} ya existían.`,
  });
});
