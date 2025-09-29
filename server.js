/**
 * server.js - OnTimeCar Scraper (versión reparada y completa)
 * - Mantiene estructura y endpoints existentes
 * - Lectura robusta de campos dentro de inputs/select/textarea/contenteditable
 * - Filtrado por cédula normalizado (solo dígitos)
 * - Devuelve una única fila exacta para agendamiento (primer match)
 * - Incluye Fecha Vigencia, IPS Destino y Estado en la salida
 */

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- Mantén aquí exactamente tus constantes como prefieras ---
const ONTIMECAR_CONFIG = {
  loginUrl: 'https://app.ontimecar.co/app/home/',
  username: 'ANDRES',
  password: 'IAResponsable',
  endpoints: {
    agendamiento: 'https://app.ontimecar.co/app/agendamiento/',
    programacion: 'https://app.ontimecar.co/app/programacion/',
    panel: 'https://app.ontimecar.co/app/agendamientos_panel/',
    preautorizaciones: 'https://app.ontimecar.co/app/preautorizaciones/'
  }
};

// Mantener el mapeo de columnas tal como lo tenías (puedes ajustar nombres más legibles si quieres)
const COLUMNAS_POR_TIPO = {
  agendamiento: {
    skip: 0,
    columnas: [
      'col_0_acciones',
      'col_1',
      'col_2_sms',
      'col_3_fechaCita',
      'col_4_identificacionUsuario',
      'col_5_nombreUsuario',
      'col_6_telefonoUsuario',
      'col_7_zona',
      'col_8_ciudadOrigen',
      'col_9_direccionOrigen',
      'col_10_ciudadDestino',
      'col_11_ipsDestino',
      'col_12_cantidadServiciosAutorizados',
      'col_13_numeroAutorizacion',
      'col_14_fechaVigencia', // <-- importante: incluida
      'col_15_horaRecogida',
      'col_16_horaRetorno',
      'col_17_nombreAcompanante',
      'col_18_identificacionAcompanante',
      'col_19_parentesco',
      'col_20_telefonoAcompanante',
      'col_21_conductor',
      'col_22_celular',
      'col_23_observaciones',
      'col_24_estado'
    ]
  },
  programacion: {
    skip: 0,
    columnas: [
      'col_0_exportar',
      'col_1_correoEnviado',
      'col_2_fechaCita',
      'col_3_nombrePaciente',
      'col_4_numeroTelAfiliado',
      'col_5_documento',
      'col_6_ciudadOrigen',
      'col_7_direccionOrigen',
      'col_8_vacia',
      'col_9_ciudadDestino',
      'col_10_direccionDestino',
      'col_11_horaRecogida',
      'col_12_horaRetorno',
      'col_13_conductor',
      'col_14_vacia',
      'col_15_eps',
      'col_16_observaciones',
      'col_17_vacia',
      'col_18_correo',
      'col_19_vacia',
      'col_20_zona',
      'col_21_autorizacion'
    ]
  },
  panel: {
    skip: 0,
    columnas: [
      'col_0_acciones',
      'col_1_fechaEmision',
      'col_2_fechaFinal',
      'col_3_tipoId',
      'col_4_nombreAfiliado',
      'col_5_clase',
      'col_6_numero',
      'col_7_estado',
      'col_8_codigo',
      'col_9_cantidad',
      'col_10_numeroPrescripcion',
      'col_11_ciudadOrigen',
      'col_12_direccionOrigen',
      'col_13_ciudadDestino',
      'col_14_direccionDestino',
      'col_15_eps',
      'col_16_cantidadServicios',
      'col_17_subirAutorizacion',
      'col_18_observaciones',
      'col_19_nombreAco',
      'col_20_parentesco',
      'col_21_telefonoAco',
      'col_22_tipoDocumentoAco',
      'col_23_numeroDocumentoAco',
      'col_24_agendamientosExistentes'
    ]
  },
  preautorizaciones: {
    skip: 0,
    columnas: [
      'col_0_acciones',
      'col_1_agendamientoAutorizaciones',
      'col_2_fechaEmision',
      'col_3_fechaFinal',
      'col_4_tipoIdAfiliado',
      'col_5_nombreAfiliado',
      'col_6_clase',
      'col_7_vacia',
      'col_8_numero',
      'col_9_estado',
      'col_10_vacia',
      'col_11_codigo',
      'col_12_cantidad',
      'col_13_numeroPrescripcion',
      'col_14_ciudadOrigen',
      'col_15_direccionOrigen',
      'col_16_ciudadDestino',
      'col_17_direccionDestino',
      'col_18_cantidadEpsServicios',
      'col_19_subirAutorizacion',
      'col_20_vacia',
      'col_21_nombreAco',
      'col_22_idAco',
      'col_23_numeroAco',
      'col_24_telefonoAco',
      'col_25_parentesco',
      'col_26_vacia',
      'col_27_aco',
      'col_28_agendamientosExistentes'
    ]
  }
};

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - query: ${JSON.stringify(req.query)}`);
  next();
});

// Util: normalizar solo dígitos
function normalizeDigits(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/\D/g, '');
}

// Función que hace login, filtra y extrae según tipo
async function consultarOnTimeCar(cedula, tipoConsulta) {
  let browser = null;
  try {
    if (!ONTIMECAR_CONFIG.endpoints[tipoConsulta]) {
      throw new Error(`Tipo de consulta inválido: ${tipoConsulta}`);
    }

    const cedulaNormalized = normalizeDigits(cedula || '');

    console.log(`[SCRAPER] Inicio: tipo=${tipoConsulta} cedula=${cedula} normalized=${cedulaNormalized}`);

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 800 });

    // --- LOGIN (robusto) ---
    console.log('[SCRAPER] Navegando a login...');
    await page.goto(ONTIMECAR_CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    // Esperar inputs (varios selectores por compatibilidad)
    await page.waitForSelector('input[name="username"], input#username, input[type="text"], input[name="email"]', { timeout: 15000 });

    // Rellenar inputs mediante evaluate para disparar eventos
    await page.evaluate((username, password) => {
      const u = document.querySelector('input[name="username"], input#username, input[type="text"], input[name="email"]');
      const p = document.querySelector('input[name="password"], input#password, input[type="password"]');
      if (u) { u.focus(); u.value = username; u.dispatchEvent(new Event('input', { bubbles: true })); }
      if (p) { p.focus(); p.value = password; p.dispatchEvent(new Event('input', { bubbles: true })); }
    }, ONTIMECAR_CONFIG.username, ONTIMECAR_CONFIG.password);

    // Intentar submit robusto
    await Promise.all([
      page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"], input[type="submit"], button.btn-primary');
        if (btn) { btn.click(); return true; }
        const form = document.querySelector('form');
        if (form) { form.submit(); return true; }
        return false;
      }),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null)
    ]);

    console.log('[SCRAPER] Login realizado (o se completó por AJAX).');

    // --- Ir a la página del tipo de consulta ---
    const urlBase = ONTIMECAR_CONFIG.endpoints[tipoConsulta];
    console.log(`[SCRAPER] Navegando a ${urlBase}`);
    await page.goto(urlBase, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForTimeout(1200);

    // --- Buscar campo de búsqueda y filtrar por cédula ---
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="Buscar"]',
      'input[placeholder*="buscar"]',
      'input[aria-controls]',
      'input[name="search"]',
      'input[id*="search"]',
      'input[class*="search"]',
      'input.form-control'
    ];

    let searchFound = false;
    for (const sel of searchSelectors) {
      const el = await page.$(sel);
      if (el) {
        try {
          await page.evaluate((selector, value) => {
            const input = document.querySelector(selector);
            if (!input) return;
            input.focus();
            input.value = '';
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }, sel, cedula);
          // intentar ENTER
          await page.keyboard.press('Enter').catch(() => null);
          await page.waitForTimeout(1200);
          searchFound = true;
          console.log(`[SCRAPER] Cédula ingresada en selector ${sel}`);
          break;
        } catch (err) {
          console.warn('[SCRAPER] fallo escritura en selector', sel, err.message);
        }
      }
    }

    if (!searchFound) {
      // heurística: intentar con primer input visible que probablemente sea búsqueda y click en boton filtrar si existe
      try {
        await page.evaluate((value) => {
          const inputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null && i.type !== 'hidden');
          if (inputs.length === 0) return;
          // priorizar inputs que contengan palabras relevantes
          let input = inputs.find(i => /buscar|search|cedul|ident|documento/i.test(i.placeholder || i.name || i.id || i.className)) || inputs[0];
          input.focus();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, cedula);
        // intentar click en botón filtrar
        const filtroBtn = await page.$x("//button[contains(translate(., 'FILTRAR', 'filtrar'), 'filtrar') or contains(., 'Filter') or contains(., 'Buscar')]");
        if (filtroBtn && filtroBtn.length) {
          await filtroBtn[0].click().catch(() => null);
        }
        await page.waitForTimeout(1400);
        console.log('[SCRAPER] Filtrado heurístico intentado.');
      } catch (e) {
        console.warn('[SCRAPER] No se pudo filtrar heurísticamente:', e.message);
      }
    }

    // Esperar filas de tabla (tolerante)
    try {
      await page.waitForSelector('table tbody tr, .table tbody tr, .dataTable tbody tr', { timeout: 8000 });
    } catch (e) {
      console.warn('[SCRAPER] Timeout esperando filas de tabla; puede que no haya resultados visibles.');
    }

    // --- Extracción robusta de la tabla ---
    console.log('[SCRAPER] Extrayendo tabla de la página...');

    const configColumnas = COLUMNAS_POR_TIPO[tipoConsulta];

    const servicios = await page.evaluate((config) => {
      // función local para obtener valor de una celda
      function getCellValue(celda) {
        if (!celda) return '';
        // inputs
        const input = celda.querySelector('input');
        if (input) {
          const t = (input.type || '').toLowerCase();
          if (t === 'checkbox' || t === 'radio') {
            return input.checked ? (input.value || 'true') : '';
          }
          if (input.value !== undefined && input.value !== null) return String(input.value).trim();
        }
        // select -> texto de la opción seleccionada o value
        const select = celda.querySelector('select');
        if (select) {
          try {
            if (select.selectedIndex >= 0) {
              const opt = select.options[select.selectedIndex];
              if (opt && (opt.textContent || opt.innerText)) return String(opt.textContent || opt.innerText).trim();
            }
            if (select.value) return String(select.value).trim();
          } catch (e) {}
        }
        // textarea
        const textarea = celda.querySelector('textarea');
        if (textarea) {
          if (textarea.value !== undefined && textarea.value !== null) return String(textarea.value).trim();
        }
        // contenteditable
        const ce = celda.querySelector('[contenteditable]');
        if (ce && ce.textContent) return String(ce.textContent).trim();
        // title/data attributes
        const withTitle = celda.querySelector('[title]');
        if (withTitle) {
          const t = withTitle.getAttribute('title');
          if (t) return String(t).trim();
        }
        const dataVal = celda.getAttribute('data-value') || celda.getAttribute('data-title') || celda.getAttribute('data-text');
        if (dataVal) return String(dataVal).trim();
        // anchor or img alt
        const a = celda.querySelector('a');
        if (a && (a.textContent || a.innerText)) return String(a.textContent || a.innerText).trim();
        const img = celda.querySelector('img');
        if (img && img.alt) return String(img.alt).trim();
        // fallback innerText
        if (celda.innerText) return String(celda.innerText).trim();
        if (celda.textContent) return String(celda.textContent).trim();
        return '';
      }

      // localizar tablas posibles
      const tablas = [
        document.querySelector('table tbody'),
        document.querySelector('.table tbody'),
        document.querySelector('.dataTable tbody'),
        document.querySelector('[class*="table"] tbody'),
        document.querySelector('tbody')
      ].filter(t => t !== null);

      if (tablas.length === 0) return [];

      // elegir la primera tabla que tenga filas
      let tbody = tablas.find(t => t.querySelectorAll('tr').length > 0) || tablas[0];
      const filas = Array.from(tbody.querySelectorAll('tr'));
      const resultados = filas.map(fila => {
        const celdas = Array.from(fila.querySelectorAll('td'));
        if (celdas.length === 0) return null;
        const datos = celdas.map(c => getCellValue(c));
        // construir objeto mapeado por índice (sin renombrar)
        const registro = {};
        // guardamos columnas completas por índice para diagnóstico
        registro._raw = datos;
        // también guardamos texto combinado
        registro._textoFila = datos.join(' | ');
        return registro;
      }).filter(r => r !== null);

      return resultados;
    }, configColumnas);

    // servicios: array con registros que tienen _raw (array of cell texts)
    // Ahora mapeamos a nombres según configColumnas.columnas
    const mapeados = servicios.map(r => {
      const datos = r._raw || [];
      const datosRelevantes = datos.slice(configColumnas.skip || 0);
      const registro = {};
      configColumnas.columnas.forEach((nombre, idx) => {
        registro[nombre] = datosRelevantes[idx] !== undefined ? datosRelevantes[idx] : '';
      });
      // incluir texto completo para rastreo
      registro._textoFila = r._textoFila;
      return registro;
    });

    console.log(`[SCRAPER] Filas mapeadas: ${mapeados.length}`);

    // --- FILTRADO por cédula: comportamiento especial para agendamiento ---
    let filtered = mapeados;

    // función utilitaria para intentar localizar campo identificacion dentro de un registro
    function registroContainsCedula(reg, cedulaNorm) {
      if (!cedulaNorm) return false;
      // Check all values in the record: if any contains the normalized cedula as substring or equals
      for (const k of Object.keys(reg)) {
        if (k.startsWith('_')) continue;
        const v = reg[k] || '';
        const vnorm = ('' + (v || '')).replace(/\D/g, '');
        if (!vnorm) continue;
        if (vnorm === cedulaNorm) return true;
        if (vnorm.includes(cedulaNorm)) return true;
      }
      return false;
    }

    if (tipoConsulta === 'agendamiento' && cedulaNormalized) {
      const exactMatches = mapeados.filter(r => registroContainsCedula(r, cedulaNormalized));
      if (exactMatches.length > 0) {
        // tomar la primera coincidencia exacta (prioridad)
        filtered = [exactMatches[0]];
      } else {
        // fallback: si no hay exact matches, intentar includes sin normalizar estrictamente
        const looseMatches = mapeados.filter(r => {
          for (const k of Object.keys(r)) {
            if (k.startsWith('_')) continue;
            const v = r[k] || '';
            if (('' + v).toLowerCase().includes(cedulaNormalized)) return true;
          }
          return false;
        });
        filtered = looseMatches;
      }
    } else if (cedulaNormalized) {
      // para otros tipos, filtrar si aparece la cédula normalizada en cualquier celda
      filtered = mapeados.filter(r => registroContainsCedula(r, cedulaNormalized));
    }

    console.log(`[SCRAPER] Registros después de filtrar por cédula: ${filtered.length}`);

    // --- Si es agendamiento, devolver solo 1 registro (primer match) y mapear campos prioritarios ---
    if (tipoConsulta === 'agendamiento') {
      if (filtered.length === 0) {
        // devolver estructura vacía (compatibilidad con N8N)
        await browser.close();
        return {
          success: true,
          tipo: tipoConsulta,
          cedula: cedula,
          total: 0,
          servicios: [],
          mensaje: `No se encontraron registros en ${tipoConsulta} para la cédula ${cedula}`
        };
      }

      // Tomar el primer registro
      const r = filtered[0];

      // Mapear campos importantes — intentar leer por nombres de columna que definiste en COLUMNAS_POR_TIPO
      // Los nombres en el registro son 'col_3_fechaCita', etc. (según COLUMNAS_POR_TIPO.agendamiento.columnas)
      const map = {};
      const get = (colName) => r[colName] !== undefined ? r[colName] : '';

      // Nombres en el mapeo original:
      // 'col_3_fechaCita', 'col_4_identificacionUsuario', 'col_9_direccionOrigen', 'col_14_fechaVigencia', 'col_15_horaRecogida', 'col_16_horaRetorno',
      // 'col_17_nombreAcompanante', 'col_18_identificacionAcompanante', 'col_19_parentesco', 'col_20_telefonoAcompanante', 'col_11_ipsDestino', 'col_24_estado'
      map.identificacion_usuario = (get('col_4_identificacionUsuario') || '').trim();
      // Normalizar: si la celda contiene prefijos como "CC 6255692", extraer solo dígitos en campo separado también
      map.identificacion_usuario_digits = normalizeDigits(map.identificacion_usuario);
      map.fecha_cita = (get('col_3_fechaCita') || '').trim();
      map.fecha_vigencia = (get('col_14_fechaVigencia') || '').trim();
      map.direccion_origen = (get('col_9_direccionOrigen') || '').trim();
      map.hora_recogida = (get('col_15_horaRecogida') || '').trim();
      map.hora_retorno = (get('col_16_horaRetorno') || '').trim();
      map.nombre_acompanante = (get('col_17_nombreAcompanante') || '').trim();
      map.identificacion_acompanante = (get('col_18_identificacionAcompanante') || '').trim();
      map.parentesco = (get('col_19_parentesco') || '').trim();
      map.telefono_acompanante = (get('col_20_telefonoAcompanante') || '').trim();
      map.observaciones = (get('col_23_observaciones') || '').trim();
      map.ips_destino = (get('col_11_ipsDestino') || '').trim();
      map.estado = (get('col_24_estado') || '').trim();

      // También agregar numero autorizacion y otros campos que puedan ser útiles
      map.numero_autorizacion = (get('col_13_numeroAutorizacion') || '').trim();
      map.cantidad_servicios_autorizados = (get('col_12_cantidadServiciosAutorizados') || '').trim();
      map.nombre_usuario = (get('col_5_nombreUsuario') || '').trim();
      map.telefono_usuario = (get('col_6_telefonoUsuario') || '').trim();
      map.zona = (get('col_7_zona') || '').trim();
      map.ciudad_origen = (get('col_8_ciudadOrigen') || '').trim();
      map.ciudad_destino = (get('col_10_ciudadDestino') || '').trim();

      await browser.close();
      return {
        success: true,
        tipo: tipoConsulta,
        cedula: cedula,
        total: 1,
        servicios_originales_count: mapeados.length,
        servicio: map,
        mensaje: `Se encontró 1 registro en ${tipoConsulta} para la cédula ${cedula}`
      };
    }

    // Para otros tipos (programacion, panel, preautorizaciones) devolvemos el array filtrado completo (mapeado)
    await browser.close();
    return {
      success: true,
      tipo: tipoConsulta,
      cedula: cedula,
      total: filtered.length,
      servicios: filtered,
      mensaje: filtered.length > 0 ? `Se encontraron ${filtered.length} registro(s)` : `No se encontraron registros`
    };

  } catch (error) {
    console.error('[ERROR] consultarOnTimeCar:', error && error.message ? error.message : error);
    try { if (browser) await browser.close(); } catch (e) {}
    return {
      success: false,
      error: true,
      tipo: tipoConsulta,
      mensaje: `Error al consultar ${tipoConsulta}: ${error && error.message ? error.message : error}`,
      detalle: error && error.stack ? error.stack : null
    };
  }
}

// --- Endpoints (compatibles con tu N8N) ---

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mensaje: 'Servidor OnTimeCar Scraper funcionando correctamente',
    version: '3.2.0-fixed-cedula-filter',
    endpoints_disponibles: Object.keys(ONTIMECAR_CONFIG.endpoints),
    timestamp: new Date().toISOString()
  });
});

app.get('/consulta/agendamiento', async (req, res) => {
  try {
    const cedula = req.query.cedula;
    if (!cedula) return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
    const resultado = await consultarOnTimeCar(cedula, 'agendamiento');
    res.json(resultado);
  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
  }
});

app.get('/consulta/programacion', async (req, res) => {
  try {
    const cedula = req.query.cedula;
    if (!cedula) return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
    const resultado = await consultarOnTimeCar(cedula, 'programacion');
    res.json(resultado);
  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
  }
});

app.get('/consulta/panel', async (req, res) => {
  try {
    const cedula = req.query.cedula;
    if (!cedula) return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
    const resultado = await consultarOnTimeCar(cedula, 'panel');
    res.json(resultado);
  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
  }
});

app.get('/consulta/preautorizaciones', async (req, res) => {
  try {
    const cedula = req.query.cedula;
    if (!cedula) return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
    const resultado = await consultarOnTimeCar(cedula, 'preautorizaciones');
    res.json(resultado);
  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
  }
});

app.post('/consulta', async (req, res) => {
  try {
    const { cedula, tipo } = req.body;
    if (!cedula) return res.status(400).json({ error: true, mensaje: 'El campo "cedula" es requerido en el body' });
    const tipoConsulta = tipo || 'agendamiento';
    if (!ONTIMECAR_CONFIG.endpoints[tipoConsulta]) {
      return res.status(400).json({ error: true, mensaje: `Tipo de consulta inválido: ${tipoConsulta}`, tipos_validos: Object.keys(ONTIMECAR_CONFIG.endpoints) });
    }
    const resultado = await consultarOnTimeCar(cedula, tipoConsulta);
    res.json(resultado);
  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
  }
});

// Columnas info
app.get('/columnas/:tipo', (req, res) => {
  const tipo = req.params.tipo;
  if (!COLUMNAS_POR_TIPO[tipo]) return res.status(404).json({ error: true, mensaje: `Tipo no encontrado: ${tipo}`, tipos_disponibles: Object.keys(COLUMNAS_POR_TIPO) });
  const config = COLUMNAS_POR_TIPO[tipo];
  res.json({
    tipo,
    columnasOmitidas: config.skip,
    columnas: config.columnas,
    totalColumnas: config.columnas.length,
    descripcion: `Se omiten las primeras ${config.skip} columna(s) de la tabla HTML`
  });
});

app.get('/columnas', (req, res) => {
  const configuraciones = {};
  Object.keys(COLUMNAS_POR_TIPO).forEach(tipo => {
    configuraciones[tipo] = {
      columnasOmitidas: COLUMNAS_POR_TIPO[tipo].skip,
      columnas: COLUMNAS_POR_TIPO[tipo].columnas,
      totalColumnas: COLUMNAS_POR_TIPO[tipo].columnas.length
    };
  });
  res.json({ mensaje: 'Configuración de columnas por tipo de consulta', configuraciones });
});

app.get('/', (req, res) => {
  res.json({
    servicio: 'OnTimeCar Scraper API',
    version: '3.2.0-fixed-cedula-filter',
    tipo: 'Scraper Multi-Endpoint (compatible con N8N)',
    descripcion: 'Sistema de scraping con mapeo correcto de columnas HTML',
    endpoints: {
      health: 'GET /health',
      agendamiento: 'GET /consulta/agendamiento?cedula=NUMERO',
      programacion: 'GET /consulta/programacion?cedula=NUMERO',
      panel: 'GET /consulta/panel?cedula=NUMERO',
      preautorizaciones: 'GET /consulta/preautorizaciones?cedula=NUMERO',
      consulta_post: 'POST /consulta (body: { "cedula": "NUMERO", "tipo": "agendamiento|programacion|panel|preautorizaciones" })',
      ver_columnas: 'GET /columnas/:tipo (preautorizaciones|agendamiento|programacion|panel)',
      ver_todas_columnas: 'GET /columnas'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: true, mensaje: 'Endpoint no encontrado', ruta: req.path });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Servidor OnTimeCar Scraper iniciado`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🔐 Usuario: ${ONTIMECAR_CONFIG.username}`);
  console.log(`\n📋 Configuración de columnas:`);
  Object.keys(COLUMNAS_POR_TIPO).forEach(tipo => {
    const config = COLUMNAS_POR_TIPO[tipo];
    console.log(`   ${tipo.padEnd(20)} → Skip: ${config.skip}, Columnas: ${config.columnas.length}`);
  });
  console.log(`\n🌐 Endpoints disponibles:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /consulta/agendamiento?cedula=NUMERO`);
  console.log(`   - GET  /consulta/programacion?cedula=NUMERO`);
  console.log(`   - GET  /consulta/panel?cedula=NUMERO`);
  console.log(`   - GET  /consulta/preautorizaciones?cedula=NUMERO`);
  console.log(`   - POST /consulta (body con cedula y tipo)`);
  console.log(`   - GET  /columnas (ver todas las configuraciones)`);
  console.log(`${'='.repeat(60)}\n`);
});
