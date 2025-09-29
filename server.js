// server.js - Scraper OnTimeCar con mapeo correcto de columnas
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

// Mapeo de columnas por tipo de consulta - TODAS LAS COLUMNAS SIN OMITIR
const COLUMNAS_POR_TIPO = {
    agendamiento: {
        skip: 0, // No omitir nada
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
        skip: 0, // No omitir nada
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
        skip: 0, // No omitir nada
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
        skip: 0, // No omitir nada
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

// Función genérica para hacer login y scraping
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
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // PASO 1: Hacer login
        console.log('[SCRAPER] Navegando a página de login...');
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        console.log('[SCRAPER] Ingresando credenciales...');
        await page.waitForSelector('input[name="username"], input#username, input[type="text"]', { timeout: 10000 });
        
        await page.type('input[name="username"], input#username, input[type="text"]', ONTIMECAR_CONFIG.username);
        await page.type('input[name="password"], input#password, input[type="password"]', ONTIMECAR_CONFIG.password);
        
        await Promise.all([
            page.click('button[type="submit"], input[type="submit"], button.btn-primary'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);

        console.log(`[SCRAPER] Login exitoso. Navegando a ${tipoConsulta}...`);

        // PASO 2: Navegar a la página específica
        const urlBase = ONTIMECAR_CONFIG.endpoints[tipoConsulta];
        await page.goto(urlBase, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        console.log('[SCRAPER] Esperando a que cargue la página...');
        await page.waitForTimeout(2000);

        // PASO 3: Buscar el campo de búsqueda y filtrar por cédula
        console.log(`[SCRAPER] Buscando campo de búsqueda para filtrar por: ${cedula}`);
        
        try {
            // Intentar encontrar el campo de búsqueda (común en DataTables)
            const searchSelector = 'input[type="search"], input.form-control[placeholder*="Buscar"], input[aria-controls]';
            await page.waitForSelector(searchSelector, { timeout: 5000 });
            
            // Limpiar y escribir en el campo de búsqueda
            await page.evaluate((selector) => {
                const input = document.querySelector(selector);
                if (input) input.value = '';
            }, searchSelector);
            
            await page.type(searchSelector, cedula, { delay: 100 });
            console.log('[SCRAPER] Cédula ingresada en campo de búsqueda');
            
            // Esperar a que la tabla se actualice
            await page.waitForTimeout(2000);
            
        } catch (e) {
            console.log('[SCRAPER] No se encontró campo de búsqueda, intentando con URL...');
            // Si no hay campo de búsqueda, intentar con parámetro URL
            const urlConsulta = `${urlBase}?search=${cedula}`;
            await page.goto(urlConsulta, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            await page.waitForTimeout(2000);
        }

        console.log('[SCRAPER] Esperando a que cargue la tabla...');
        await page.waitForTimeout(3000);

        try {
            await page.waitForSelector('table tbody tr, .table tbody tr, .dataTable tbody tr', { timeout: 5000 });
        } catch (e) {
            console.log('[SCRAPER] No se encontró tabla con los selectores estándar');
        }

        // PASO 4: Extraer datos de la tabla con mapeo correcto
        console.log('[SCRAPER] Extrayendo datos de la tabla...');
        
        const configColumnas = COLUMNAS_POR_TIPO[tipoConsulta];
        
        const servicios = await page.evaluate((config, cedulaBuscada) => {
            const tablas = [
                document.querySelector('table tbody'),
                document.querySelector('.table tbody'),
                document.querySelector('.dataTable tbody'),
                document.querySelector('[class*="table"] tbody')
            ].filter(t => t !== null);

            if (tablas.length === 0) {
                console.log('No se encontró ninguna tabla');
                return [];
            }

            const tbody = tablas[0];
            const filas = Array.from(tbody.querySelectorAll('tr'));
            
            console.log(`Encontradas ${filas.length} filas en total`);

            return filas.map((fila) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                if (celdas.length === 0) return null;

                // Verificar si el texto de la fila contiene la cédula buscada
                const textoFila = Array.from(celdas).map(c => c.innerText?.trim() || '').join(' ');
                const contieneCedula = textoFila.includes(cedulaBuscada);

                const datos = celdas.map(c => c.innerText?.trim() || '');
                
                // Omitir las primeras N columnas según la configuración
                const datosRelevantes = datos.slice(config.skip);
                
                // Mapear datos según las columnas definidas
                const registro = {
                    _contieneCedula: contieneCedula,
                    _totalColumnas: datos.length,
                    _datosCompletos: datos
                };
                
                config.columnas.forEach((nombreColumna, index) => {
                    registro[nombreColumna] = datosRelevantes[index] || '';
                });
                
                return registro;
            }).filter(servicio => servicio !== null);
        }, configColumnas, cedula);

        console.log(`[SCRAPER] Se encontraron ${servicios.length} registros en ${tipoConsulta}`);

        await browser.close();

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
        console.error('[ERROR]', error);
        
        if (browser) {
            await browser.close();
        }

        return {
            success: false,
            error: true,
            tipo: tipoConsulta,
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
        version: '3.2.0',
        tipo: 'Scraper Multi-Endpoint con Skip de Columnas',
        endpoints_disponibles: Object.keys(ONTIMECAR_CONFIG.endpoints),
        timestamp: new Date().toISOString()
    });
});

// Endpoint: Agendamiento
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

// Endpoint: Programación
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

// Endpoint: Panel de Agendamientos
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

// Endpoint: Preautorizaciones
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

// Endpoint POST genérico (acepta tipo en el body)
app.post('/consulta', async (req, res) => {
    try {
        const { cedula, tipo } = req.body;
        
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El campo "cedula" es requerido en el body'
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

// Endpoint para ver todas las configuraciones
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

// Ruta raíz con información del API
app.get('/', (req, res) => {
    res.json({
        servicio: 'OnTimeCar Scraper API',
        version: '3.2.0',
        tipo: 'Scraper Multi-Endpoint con Skip de Columnas',
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
        documentacion: 'Consulta el estado de servicios de On Time Car por cédula en diferentes secciones',
        caracteristicas: [
            'Mapeo automático de columnas por tipo de tabla',
            'Skip de columnas de sistema (acciones, menú, etc)',
            'Soporte para múltiples endpoints',
            'Validación de parámetros',
            'Logging detallado'
        ]
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
            '/columnas',
            '/columnas/:tipo'
        ]
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Servidor OnTimeCar Scraper v3.2.0 iniciado correctamente`);
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
