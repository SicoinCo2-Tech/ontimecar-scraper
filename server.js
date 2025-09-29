// server.js - Scraper OnTimeCar con múltiples endpoints CORREGIDO
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Middleware para logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Credenciales de OnTimeCar
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

// Función mejorada para hacer login y scraping
async function consultarOnTimeCar(cedula, tipoConsulta) {
    let browser = null;
    
    try {
        console.log(`[SCRAPER] Iniciando consulta ${tipoConsulta} para cédula: ${cedula}`);
        
        // Validar tipo de consulta
        if (!ONTIMECAR_CONFIG.endpoints[tipoConsulta]) {
            throw new Error(`Tipo de consulta inválido: ${tipoConsulta}`);
        }
        
        // Lanzar navegador
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        const page = await browser.newPage();
        
        // Configurar timeout más largo
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);
        
        await page.setViewport({ width: 1366, height: 768 });

        // Configurar intercepción de requests para evitar recursos pesados
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // PASO 1: Hacer login
        console.log('[SCRAPER] Navegando a página de login...');
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log('[SCRAPER] Ingresando credenciales...');
        
        // Esperar y encontrar inputs de login de forma más robusta
        await page.waitForFunction(() => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input[name*="user"], input[name*="pass"]');
            return inputs.length >= 2;
        }, { timeout: 15000 });

        // Encontrar inputs de forma más flexible
        const usernameInput = await page.$('input[type="text"], input[name="username"], input[name="user"], input#username, input[placeholder*="usuario"], input[placeholder*="Usuario"]');
        const passwordInput = await page.$('input[type="password"], input[name="password"], input[name="pass"], input#password, input[placeholder*="contraseña"], input[placeholder*="Contraseña"]');

        if (!usernameInput || !passwordInput) {
            throw new Error('No se pudieron encontrar los campos de login');
        }

        await usernameInput.click({ clickCount: 3 });
        await usernameInput.type(ONTIMECAR_CONFIG.username, { delay: 100 });
        
        await passwordInput.click({ clickCount: 3 });
        await passwordInput.type(ONTIMECAR_CONFIG.password, { delay: 100 });
        
        // Hacer click en el botón de login
        const loginButton = await page.$('button[type="submit"], input[type="submit"], button.btn-primary, button[class*="btn"], input[class*="btn"]');
        if (loginButton) {
            await Promise.all([
                loginButton.click(),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
            ]);
        } else {
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
        }

        console.log(`[SCRAPER] Login exitoso. Navegando a ${tipoConsulta}...`);

        // PASO 2: Navegar a la página específica
        const urlBase = ONTIMECAR_CONFIG.endpoints[tipoConsulta];
        await page.goto(urlBase, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log('[SCRAPER] Página cargada, buscando campo de búsqueda...');

        // Estrategia mejorada para buscar y filtrar
        let busquedaRealizada = false;

        // Intentar diferentes métodos para encontrar el campo de búsqueda
        const selectoresBusqueda = [
            'input[type="search"]',
            'input[placeholder*="buscar"]',
            'input[placeholder*="Buscar"]',
            'input[name="search"]',
            'input[class*="search"]',
            '.dataTables_filter input',
            '.table-filter input',
            'input[type="text"]'
        ];

        let campoBusqueda = null;
        for (const selector of selectoresBusqueda) {
            campoBusqueda = await page.$(selector);
            if (campoBusqueda) {
                console.log(`[SCRAPER] Encontrado campo de búsqueda con selector: ${selector}`);
                break;
            }
        }

        if (campoBusqueda) {
            console.log('[SCRAPER] Escribiendo cédula en campo de búsqueda...');
            await campoBusqueda.click({ clickCount: 3 });
            await campoBusqueda.type(cedula, { delay: 100 });
            
            // Esperar a que los resultados se filtren
            await page.waitForTimeout(3000);
            busquedaRealizada = true;
        } else {
            console.log('[SCRAPER] No se encontró campo de búsqueda, procediendo sin filtro...');
        }

        // Si no se pudo hacer búsqueda, intentar con parámetros URL
        if (!busquedaRealizada) {
            console.log('[SCRAPER] Intentando con parámetros URL...');
            const urlConFiltro = `${urlBase}?search=${encodeURIComponent(cedula)}`;
            await page.goto(urlConFiltro, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });
        }

        console.log('[SCRAPER] Esperando a que cargue la tabla...');
        
        // Esperar más tiempo y con diferentes estrategias
        await page.waitForTimeout(5000);

        // Intentar diferentes selectores de tabla
        const selectoresTabla = [
            'table tbody tr',
            '.table tbody tr',
            '.dataTable tbody tr',
            '[class*="table"] tbody tr',
            'tbody tr',
            'tr[role="row"]',
            '.agendamiento-row',
            '.programacion-row'
        ];

        let filasEncontradas = [];
        
        for (const selector of selectoresTabla) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                filasEncontradas = await page.$$(selector);
                if (filasEncontradas.length > 0) {
                    console.log(`[SCRAPER] Encontradas ${filasEncontradas.length} filas con selector: ${selector}`);
                    break;
                }
            } catch (e) {
                // Continuar con el siguiente selector
            }
        }

        // Si no encontramos filas, intentar una estrategia más agresiva
        if (filasEncontradas.length === 0) {
            console.log('[SCRAPER] Buscando cualquier tabla en la página...');
            filasEncontradas = await page.$$('table tr, .table tr, tbody tr, tr');
            console.log(`[SCRAPER] Encontrados ${filasEncontradas.length} elementos tr en total`);
        }

        // PASO 3: Extraer datos de forma más robusta
        console.log('[SCRAPER] Extrayendo datos de la tabla...');
        
        const servicios = await page.evaluate(() => {
            // Buscar todas las tablas posibles
            const todasLasTablas = Array.from(document.querySelectorAll('table, .table, [class*="table"]'));
            console.log(`Encontradas ${todasLasTablas.length} tablas en la página`);

            let todosLosDatos = [];

            todasLasTablas.forEach((tabla, tablaIndex) => {
                // Buscar filas en diferentes ubicaciones
                const cuerposTabla = [
                    tabla.querySelector('tbody'),
                    tabla
                ].filter(t => t !== null);

                cuerposTabla.forEach(cuerpo => {
                    const filas = Array.from(cuerpo.querySelectorAll('tr')).filter(tr => {
                        // Filtrar filas de encabezado
                        const thCount = tr.querySelectorAll('th').length;
                        return thCount === 0;
                    });

                    console.log(`Tabla ${tablaIndex + 1}: ${filas.length} filas de datos`);

                    filas.forEach((fila, filaIndex) => {
                        const celdas = Array.from(fila.querySelectorAll('td, th'));
                        
                        if (celdas.length > 0) {
                            const datos = celdas.map((c, index) => {
                                // Obtener texto limpio
                                let texto = c.innerText?.trim() || '';
                                // Limpiar texto de espacios múltiples y saltos de línea
                                texto = texto.replace(/\s+/g, ' ').trim();
                                return texto;
                            });

                            // Crear objeto con todos los datos disponibles
                            const servicio = {
                                tabla: tablaIndex + 1,
                                fila: filaIndex + 1,
                                datosCompletos: datos,
                                datosRaw: datos.join(' | ')
                            };

                            // Mapear datos por posición (ajusta según tu estructura)
                            if (datos.length >= 1) servicio.accion = datos[0];
                            if (datos.length >= 2) servicio.fechaSolicitud = datos[1];
                            if (datos.length >= 3) servicio.fechaRecepcion = datos[2];
                            if (datos.length >= 4) servicio.tipoDocumento = datos[3];
                            if (datos.length >= 5) servicio.nombre = datos[4];
                            if (datos.length >= 6) servicio.clase = datos[6];
                            if (datos.length >= 7) servicio.numero = datos[6];
                            if (datos.length >= 8) servicio.estado = datos[7];
                            if (datos.length >= 9) servicio.codigo = datos[8];
                            if (datos.length >= 10) servicio.cantidad = datos[9];
                            if (datos.length >= 11) servicio.prescripcion = datos[10];
                            if (datos.length >= 12) servicio.ciudadOrigen = datos[11];
                            if (datos.length >= 13) servicio.direccionOrigen = datos[12];
                            if (datos.length >= 14) servicio.ciudadDestino = datos[13];
                            if (datos.length >= 15) servicio.direccionDestino = datos[14];
                            if (datos.length >= 16) servicio.eps = datos[15];
                            if (datos.length >= 17) servicio.cantidadServicios = datos[16];
                            if (datos.length >= 18) servicio.subirAutorizacion = datos[17];
                            if (datos.length >= 19) servicio.observaciones = datos[18];
                            if (datos.length >= 20) servicio.nombrePaciente = datos[19];
                            if (datos.length >= 21) servicio.parentesco = datos[20];
                            if (datos.length >= 22) servicio.telefonoDocumentoAco = datos[21];
                            if (datos.length >= 23) servicio.numeroDocumentoAco = datos[22];
                            if (datos.length >= 24) servicio.agendamientos = datos[23];

                            todosLosDatos.push(servicio);
                        }
                    });
                });
            });

            return todosLosDatos;
        });

        // Filtrar servicios que contengan la cédula buscada
        const serviciosFiltrados = servicios.filter(servicio => {
            const textoCompleto = servicio.datosRaw.toLowerCase();
            return textoCompleto.includes(cedula.toLowerCase());
        });

        console.log(`[SCRAPER] Se encontraron ${servicios.length} registros totales, ${serviciosFiltrados.length} filtrados por cédula`);

        await browser.close();

        return {
            success: true,
            tipo: tipoConsulta,
            cedula: cedula,
            total: serviciosFiltrados.length,
            servicios: serviciosFiltrados,
            mensaje: serviciosFiltrados.length > 0 
                ? `Se encontraron ${serviciosFiltrados.length} registro(s) en ${tipoConsulta} para la cédula ${cedula}`
                : `No se encontraron registros en ${tipoConsulta} para la cédula ${cedula}`
        };

    } catch (error) {
        console.error('[ERROR]', error);
        
        if (browser) {
            await browser.close();
        }

        return {
            success: false,
            error: true,
            tipo: tipoConsulta,
            cedula: cedula,
            mensaje: `Error al consultar ${tipoConsulta}: ${error.message}`,
            detalle: error.stack
        };
    }
}

// Health Check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mensaje: 'Servidor OnTimeCar Scraper funcionando correctamente',
        version: '3.1.0',
        tipo: 'Scraper Multi-Endpoint - CORREGIDO',
        endpoints_disponibles: Object.keys(ONTIMECAR_CONFIG.endpoints),
        timestamp: new Date().toISOString()
    });
});

// Endpoints individuales (mantener igual)
app.get('/consulta/agendamiento', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }
        const resultado = await consultarOnTimeCar(cedula, 'agendamiento');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

app.get('/consulta/programacion', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }
        const resultado = await consultarOnTimeCar(cedula, 'programacion');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

app.get('/consulta/panel', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }
        const resultado = await consultarOnTimeCar(cedula, 'panel');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

app.get('/consulta/preautorizaciones', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }
        const resultado = await consultarOnTimeCar(cedula, 'preautorizaciones');
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

// Nuevo endpoint: Consulta todos los tipos a la vez
app.get('/consulta/completa', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }

        const tipos = Object.keys(ONTIMECAR_CONFIG.endpoints);
        const resultados = {};

        for (const tipo of tipos) {
            console.log(`[CONSULTA COMPLETA] Consultando ${tipo}...`);
            resultados[tipo] = await consultarOnTimeCar(cedula, tipo);
            // Pequeña pausa entre consultas
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        res.json({
            success: true,
            cedula: cedula,
            consulta_completa: true,
            timestamp: new Date().toISOString(),
            resultados: resultados
        });

    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error en consulta completa',
            detalle: error.message
        });
    }
});

// Endpoint POST genérico (mejorado)
app.post('/consulta', async (req, res) => {
    try {
        const { cedula, tipo, completa } = req.body;
        
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El campo "cedula" es requerido en el body'
            });
        }

        if (completa) {
            // Consulta completa
            const tipos = Object.keys(ONTIMECAR_CONFIG.endpoints);
            const resultados = {};

            for (const tipoConsulta of tipos) {
                resultados[tipoConsulta] = await consultarOnTimeCar(cedula, tipoConsulta);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            return res.json({
                success: true,
                cedula: cedula,
                consulta_completa: true,
                resultados: resultados
            });
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
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

// Ruta raíz con información del API
app.get('/', (req, res) => {
    res.json({
        servicio: 'OnTimeCar Scraper API - CORREGIDO',
        version: '3.1.0',
        tipo: 'Scraper Multi-Endpoint Mejorado',
        mejoras: [
            'Búsqueda más robusta de campos de filtro',
            'Múltiples estrategias para encontrar tablas',
            'Extracción completa de todos los datos disponibles',
            'Filtrado por cédula en todos los resultados',
            'Consulta completa en un solo endpoint'
        ],
        endpoints: {
            health: 'GET /health',
            agendamiento: 'GET /consulta/agendamiento?cedula=NUMERO',
            programacion: 'GET /consulta/programacion?cedula=NUMERO',
            panel: 'GET /consulta/panel?cedula=NUMERO',
            preautorizaciones: 'GET /consulta/preautorizaciones?cedula=NUMERO',
            completa: 'GET /consulta/completa?cedula=NUMERO',
            consulta_post: 'POST /consulta (body: { "cedula": "NUMERO", "tipo": "agendamiento|programacion|panel|preautorizaciones", "completa": true|false })'
        },
        documentacion: 'Consulta el estado de servicios de On Time Car por cédula en diferentes secciones - Versión Mejorada'
    });
});

// Manejo de rutas no encontradas
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
            '/consulta/completa'
        ]
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor OnTimeCar Scraper CORREGIDO iniciado correctamente`);
    console.log(`📡 Escuchando en puerto ${PORT}`);
    console.log(`🌐 Endpoints disponibles:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /consulta/agendamiento?cedula=NUMERO`);
    console.log(`   - GET  /consulta/programacion?cedula=NUMERO`);
    console.log(`   - GET  /consulta/panel?cedula=NUMERO`);
    console.log(`   - GET  /consulta/preautorizaciones?cedula=NUMERO`);
    console.log(`   - GET  /consulta/completa?cedula=NUMERO (NUEVO)`);
    console.log(`   - POST /consulta (body con cedula y tipo/completa)`);
    console.log(`🔐 Credenciales configuradas: ${ONTIMECAR_CONFIG.username}`);
    console.log(`🚀 Mejoras: Búsqueda robusta, múltiples estrategias, datos completos`);
});
