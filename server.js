// server.js - Versión corregida: mantiene estructura original y endpoints.
// Cambios principales:
// - Extracción robusta de celdas: inputs, selects, textareas, contenteditable, title, data-*, fallback innerText.
// - Dispatch de evento input al escribir en campo búsqueda y opcional click en botón 'Filtrar'.
// - Mantiene ONTIMECAR_CONFIG, COLUMNAS_POR_TIPO y endpoints compatibles con tu N8N.
// - Manejo de errores y cierre seguro del browser.

const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- Mantener exactamente tus constantes como estaban ---
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

// Mapeo columnas (tomado de tu código original)
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
            'col_14_fechaVigencia',
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

// --- Función principal de scraping: conservar nombre y contrato de salida similar al tuyo ---
async function consultarOnTimeCar(cedula, tipoConsulta) {
    let browser = null;
    try {
        console.log(`[SCRAPER] Iniciando consulta ${tipoConsulta} para cédula: ${cedula}`);

        if (!ONTIMECAR_CONFIG.endpoints[tipoConsulta]) {
            throw new Error(`Tipo de consulta inválido: ${tipoConsulta}`);
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // --- PASO 1: Login ---
        console.log('[SCRAPER] Navegando a página de login...');
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: 45000 });

        // Esperar campo username/password - usar selectores robustos
        await page.waitForSelector('input[name="username"], input#username, input[type="text"], input[name="email"]', { timeout: 15000 });

        console.log('[SCRAPER] Ingresando credenciales...');
        // Rellenar username y password de forma robusta
        await page.evaluate((username, password) => {
            const u = document.querySelector('input[name="username"], input#username, input[type="text"], input[name="email"]');
            const p = document.querySelector('input[name="password"], input#password, input[type="password"]');
            if (u) { u.focus(); u.value = username; u.dispatchEvent(new Event('input', { bubbles: true })); }
            if (p) { p.focus(); p.value = password; p.dispatchEvent(new Event('input', { bubbles: true })); }
        }, ONTIMECAR_CONFIG.username, ONTIMECAR_CONFIG.password);

        // Intentar submit (varias opciones)
        await Promise.all([
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"], input[type="submit"], button.btn-primary, button.login-button');
                if (btn) { btn.click(); return true; }
                const form = document.querySelector('form');
                if (form) { form.submit(); return true; }
                return false;
            }),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(e => {
                // si no navega, no romper; la app puede usar AJAX
                return null;
            })
        ]);

        console.log('[SCRAPER] Login completado (o se envió pendiente).');

        // --- PASO 2: Navegar a la página específica ---
        const urlBase = ONTIMECAR_CONFIG.endpoints[tipoConsulta];
        await page.goto(urlBase, { waitUntil: 'networkidle2', timeout: 45000 });
        console.log(`[SCRAPER] Navegando a ${urlBase} ...`);
        await page.waitForTimeout(1500);

        // --- PASO 3: Intentar ingresar la cédula en el campo de búsqueda (varias estrategias) ---
        console.log(`[SCRAPER] Intentando filtrar por cédula: ${cedula}`);
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
            const exists = await page.$(sel);
            if (exists) {
                try {
                    // Limpiar y escribir valor con dispatch de evento input
                    await page.evaluate((selector, value) => {
                        const input = document.querySelector(selector);
                        if (!input) return;
                        input.focus();
                        input.value = '';
                        input.value = value;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }, sel, cedula);

                    // intentar enviar ENTER
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(1200);
                    searchFound = true;
                    console.log(`[SCRAPER] Se ingresó cédula en selector ${sel}`);
                    break;
                } catch (e) {
                    // seguir probando con otros selectores
                    console.warn('[SCRAPER] Error escribiendo en selector', sel, e.message);
                }
            }
        }

        if (!searchFound) {
            // buscar botón 'Filtrar' o 'Filter' y campo de texto cerca
            try {
                // intentar ubicar un campo visible y poner valor ejecutando JS más amplio
                await page.evaluate((cedula) => {
                    // buscar primero input visible manual que parezca búsqueda
                    const possible = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null && i.type !== 'hidden');
                    if (possible.length > 0) {
                        const input = possible.find(i => /buscar|search|cedul|ident|documento/i.test(i.placeholder || i.name || i.id || i.className)) || possible[0];
                        input.focus();
                        input.value = cedula;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, cedula);

                // intentar click en botón filtrar
                const filtroBtn = await page.$x("//button[contains(translate(., 'FILTRAR', 'filtrar'), 'filtrar') or contains(., 'Filter') or contains(., 'Buscar')]");
                if (filtroBtn && filtroBtn.length) {
                    await filtroBtn[0].click();
                }
                await page.waitForTimeout(1400);
                console.log('[SCRAPER] Se intentó filtrado por heurística.');
            } catch (e) {
                console.warn('[SCRAPER] No se pudo aplicar filtrado heurístico.', e.message);
            }
        }

        // Esperar a que la tabla actualice (filas)
        await page.waitForTimeout(1500);

        // Si el sitio usa AJAX podrá tardar más, dar un pequeño margen extra
        try {
            await page.waitForSelector('table tbody tr, .table tbody tr, .dataTable tbody tr', { timeout: 7000 });
        } catch (e) {
            console.warn('[SCRAPER] Timeout esperando filas de tabla; puede que no haya resultados.');
        }

        // --- PASO 4: Extracción robusta de la tabla ---
        console.log('[SCRAPER] Extrayendo datos de la tabla (robusto para inputs/selects/textareas)...');
        const configColumnas = COLUMNAS_POR_TIPO[tipoConsulta];

        const servicios = await page.evaluate((config, cedulaBuscada) => {
            // selector de tablas posibles (común en DataTables y bootstrap tables)
            const tablas = [
                document.querySelector('table tbody'),
                document.querySelector('.table tbody'),
                document.querySelector('.dataTable tbody'),
                document.querySelector('[class*="table"] tbody'),
                document.querySelector('tbody')
            ].filter(t => t !== null);

            if (tablas.length === 0) {
                // no hay tablas en el DOM
                return [];
            }

            // Usar la primera tabla que tenga filas relevantes
            let tbody = null;
            for (const t of tablas) {
                if (t.querySelectorAll('tr').length > 0) {
                    tbody = t;
                    break;
                }
            }
            if (!tbody) tbody = tablas[0];

            const filas = Array.from(tbody.querySelectorAll('tr'));

            // función local para extraer valor de una celda de forma robusta
            function getCellValue(celda) {
                if (!celda) return '';

                // 1) inputs (checkbox, radio, text, number, hidden, etc.)
                const input = celda.querySelector('input');
                if (input) {
                    const type = (input.type || '').toLowerCase();
                    if (type === 'checkbox' || type === 'radio') {
                        // si tiene value utilizas value cuando está marcado, si no, true/false
                        if (input.checked) return (input.value || 'true').toString().trim();
                        return '';
                    }
                    // normal input -> value
                    if (input.value !== undefined && input.value !== null) return input.value.toString().trim();
                    // fallback to innerText or attributes
                }

                // 2) select -> obtener texto de la opción seleccionada si posible
                const select = celda.querySelector('select');
                if (select) {
                    try {
                        if (select.selectedIndex >= 0) {
                            const opt = select.options[select.selectedIndex];
                            if (opt) {
                                const text = (opt.textContent || opt.innerText || opt.value || '').toString().trim();
                                if (text) return text;
                            }
                        }
                        // fallback al value
                        if (select.value) return select.value.toString().trim();
                    } catch (e) {
                        // ignore
                    }
                }

                // 3) textarea
                const textarea = celda.querySelector('textarea');
                if (textarea) {
                    if (textarea.value !== undefined && textarea.value !== null) return textarea.value.toString().trim();
                }

                // 4) contenteditable
                const ce = celda.querySelector('[contenteditable]');
                if (ce && ce.textContent) return ce.textContent.toString().trim();

                // 5) elementos con title (ej: <a title="...">)
                const withTitle = celda.querySelector('[title]');
                if (withTitle && withTitle.getAttribute) {
                    const t = withTitle.getAttribute('title');
                    if (t) return t.toString().trim();
                }

                // 6) data-* attributes comunes
                const dataVal = celda.getAttribute('data-value') || celda.getAttribute('data-title') || celda.getAttribute('data-text');
                if (dataVal) return dataVal.toString().trim();

                // 7) img alt
                const img = celda.querySelector('img');
                if (img && img.alt) return img.alt.toString().trim();

                // 8) anchor text
                const a = celda.querySelector('a');
                if (a && (a.textContent || a.innerText)) return (a.textContent || a.innerText).toString().trim();

                // 9) fallback innerText
                const text = celda.innerText || celda.textContent;
                if (text) return text.toString().trim();

                return '';
            }

            const resultados = filas.map(fila => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                if (celdas.length === 0) return null;

                // Extraer todo de forma robusta
                const datos = celdas.map(c => getCellValue(c));

                // Texto agregado para validar si la fila contiene la cédula
                const textoFila = datos.join(' ');
                const contieneCedula = cedulaBuscada ? textoFila.includes(cedulaBuscada) : true;

                const datosRelevantes = datos.slice(config.skip || 0);

                const registro = {
                    _contieneCedula: contieneCedula,
                    _totalColumnas: datos.length,
                    _primeras10Columnas: datos.slice(0, 10),
                    _ultimas5Columnas: datos.slice(-5)
                };

                // Mapear nombres de columna de la configuración
                config.columnas.forEach((nombreColumna, index) => {
                    registro[nombreColumna] = datosRelevantes[index] !== undefined ? datosRelevantes[index] : '';
                });

                return registro;
            }).filter(r => r !== null);

            return resultados;
        }, configColumnas, cedula);

        console.log(`[SCRAPER] Se encontraron ${Array.isArray(servicios) ? servicios.length : 0} registros en ${tipoConsulta}`);

        // cerrar navegador aquí
        await browser.close();
        browser = null;

        return {
            success: true,
            tipo: tipoConsulta,
            cedula: cedula,
            total: servicios.length,
            columnas: configColumnas.columnas,
            columnasOmitidas: configColumnas.skip,
            servicios: servicios,
            mensaje: servicios.length > 0
                ? `Se encontraron ${servicios.length} registro(s) en ${tipoConsulta} para la cédula ${cedula}`
                : `No se encontraron registros en ${tipoConsulta} para la cédula ${cedula}`
        };

    } catch (error) {
        console.error('[ERROR] consultarOnTimeCar:', error && error.message ? error.message : error);
        try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
        return {
            success: false,
            error: true,
            tipo: tipoConsulta,
            mensaje: `Error al consultar ${tipoConsulta}: ${error && error.message ? error.message : error}`,
            detalle: error && error.stack ? error.stack : null
        };
    }
}

// --- Endpoints (mantener exactamente tus endpoints existentes) ---

// Health Check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mensaje: 'Servidor OnTimeCar Scraper funcionando correctamente',
        version: '3.2.0-fixed',
        tipo: 'Scraper Multi-Endpoint (compatibilidad mantenida)',
        endpoints_disponibles: Object.keys(ONTIMECAR_CONFIG.endpoints),
        timestamp: new Date().toISOString()
    });
});

// Agendamiento
app.get('/consulta/agendamiento', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
        }
        const resultado = await consultarOnTimeCar(cedula, 'agendamiento');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
    }
});

// Programación
app.get('/consulta/programacion', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
        }
        const resultado = await consultarOnTimeCar(cedula, 'programacion');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
    }
});

// Panel (autorizaciones list)
app.get('/consulta/panel', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
        }
        const resultado = await consultarOnTimeCar(cedula, 'panel');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
    }
});

// Preautorizaciones
app.get('/consulta/preautorizaciones', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({ error: true, mensaje: 'El parámetro "cedula" es requerido' });
        }
        const resultado = await consultarOnTimeCar(cedula, 'preautorizaciones');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
    }
});

// POST genérico: acepta { cedula, tipo }
app.post('/consulta', async (req, res) => {
    try {
        const { cedula, tipo } = req.body;
        if (!cedula) {
            return res.status(400).json({ error: true, mensaje: 'El campo "cedula" es requerido en el body' });
        }
        const tipoConsulta = tipo || 'agendamiento';
        if (!ONTIMECAR_CONFIG.endpoints[tipoConsulta]) {
            return res.status(400).json({
                error: true,
                mensaje: `Tipo de consulta inválido: ${tipoConsulta}`,
                tipos_validos: Object.keys(ONTIMECAR_CONFIG.endpoints)
            });
        }
        const resultado = await consultarOnTimeCar(cedula, tipoConsulta);
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({ error: true, mensaje: 'Error interno del servidor', detalle: error.message });
    }
});

// Endpoint para ver el mapeo de columnas
app.get('/columnas/:tipo', (req, res) => {
    const tipo = req.params.tipo;
    if (!COLUMNAS_POR_TIPO[tipo]) {
        return res.status(404).json({
            error: true,
            mensaje: `Tipo no encontrado: ${tipo}`,
            tipos_disponibles: Object.keys(COLUMNAS_POR_TIPO)
        });
    }
    const config = COLUMNAS_POR_TIPO[tipo];
    res.json({
        tipo: tipo,
        columnasOmitidas: config.skip,
        columnas: config.columnas,
        totalColumnas: config.columnas.length,
        descripcion: `Se omiten las primeras ${config.skip} columna(s) de la tabla HTML`
    });
});

// Ver todas las configuraciones
app.get('/columnas', (req, res) => {
    const configuraciones = {};
    Object.keys(COLUMNAS_POR_TIPO).forEach(tipo => {
        configuraciones[tipo] = {
            columnasOmitidas: COLUMNAS_POR_TIPO[tipo].skip,
            columnas: COLUMNAS_POR_TIPO[tipo].columnas,
            totalColumnas: COLUMNAS_POR_TIPO[tipo].columnas.length
        };
    });
    res.json({
        mensaje: 'Configuración de columnas por tipo de consulta',
        configuraciones: configuraciones
    });
});

// Root info
app.get('/', (req, res) => {
    res.json({
        servicio: 'OnTimeCar Scraper API',
        version: '3.2.0-fixed',
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
        },
        caracteristicas: [
            'Mapeo automático de columnas por tipo de tabla',
            'Lectura de valores dentro de inputs/selects/textarea/contenteditable',
            'Soporte para múltiples endpoints',
            'Validación de parámetros',
            'Logging detallado'
        ]
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: true,
        mensaje: 'Endpoint no encontrado',
        ruta: req.path,
        endpoints_disponibles: [
            '/health',
            '/consulta/agendamiento',
            '/consulta/programacion',
            '/consulta/panel',
            '/consulta/preautorizaciones',
            '/columnas',
            '/columnas/:tipo'
        ]
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Servidor OnTimeCar Scraper (fix) iniciado correctamente`);
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
    console.log(`   - GET  /columnas/:tipo (ver configuración específica)`);
    console.log(`${'='.repeat(60)}\n`);
});
