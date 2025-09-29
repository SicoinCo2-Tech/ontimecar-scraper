// server.js - Scraper OnTimeCar con mapeo correcto por tabla
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

// Mapeo de columnas por tipo de consulta
const COLUMNAS_POR_TIPO = {
    preautorizaciones: [
        'acciones',
        'fechaEmision',
        'fechaFinal',
        'tipoAfiliado',
        'nombreAfiliado',
        'clase',
        'numero',
        'estado',
        'codigo',
        'cantidad',
        'numeroPrescripcion',
        'ciudadOrigen',
        'direccionOrigen',
        'ciudadDestino',
        'direccionDestino',
        'eps',
        'cantidadServicios',
        'subirAutorizacion',
        'observaciones',
        'nombreAco',
        'parentesco',
        'telefonoAco',
        'tipoDocumentoAco',
        'numeroDocumentoAco',
        'agendamientosExistentes'
    ],
    agendamiento: [
        'fechaCita',
        'identificacionUsuario',
        'nombreUsuario',
        'telefonoUsuario',
        'zona',
        'ciudadOrigen',
        'direccionOrigen',
        'ciudadDestino',
        'ipsDestino',
        'numeroAutorizacion',
        'cantidadServiciosAutorizados',
        'fechaVigencia',
        'horaRecogida',
        'horaRetorno',
        'nombreAcompanante',
        'identificacionAcompanante',
        'parentesco',
        'telefonoAcompanante',
        'conductor',
        'celular',
        'observaciones',
        'estado'
    ],
    programacion: [
        'whEnviado',
        'correoEnviado',
        'fechaCita',
        'nombrePaciente',
        'numeroTelAfiliado',
        'documento',
        'ciudadOrigen',
        'direccionOrigen',
        'ciudadDestino',
        'direccionDestino',
        'horaRecogida',
        'horaRetorno',
        'conductor',
        'eps',
        'observaciones',
        'correo',
        'zona',
        'autorizacion'
    ],
    panel: [
        'acciones',
        'fechaSolicitud',
        'fechaRecepcion',
        'tipoDocumento',
        'nombre',
        'clase',
        'numero',
        'estado',
        'codigo',
        'cantidad',
        'prescripcion',
        'ciudadOrigen',
        'direccionOrigen',
        'ciudadDestino',
        'direccionDestino',
        'eps',
        'cantidadServicios',
        'subirAutorizacion',
        'observaciones',
        'nombrePaciente',
        'parentesco',
        'telefonoDocumentoAco',
        'numeroDocumentoAco',
        'agendamientos'
    ]
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

        // PASO 2: Navegar a la página específica con filtro de cédula
        const urlConsulta = `${ONTIMECAR_CONFIG.endpoints[tipoConsulta]}?page=1&length=100&start_date=&end_date=&search=${cedula}`;
        await page.goto(urlConsulta, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        console.log('[SCRAPER] Esperando a que cargue la tabla...');
        await page.waitForTimeout(3000);

        try {
            await page.waitForSelector('table tbody tr, .table tbody tr, .dataTable tbody tr', { timeout: 5000 });
        } catch (e) {
            console.log('[SCRAPER] No se encontró tabla con los selectores estándar');
        }

        // PASO 3: Extraer datos de la tabla con mapeo correcto
        console.log('[SCRAPER] Extrayendo datos de la tabla...');
        
        const columnasEsperadas = COLUMNAS_POR_TIPO[tipoConsulta];
        
        const servicios = await page.evaluate((columnas) => {
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
            
            console.log(`Encontradas ${filas.length} filas`);

            return filas.map((fila) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                if (celdas.length === 0) return null;

                const datos = celdas.map(c => c.innerText?.trim() || '');
                
                // Mapear datos según las columnas definidas
                const registro = {};
                columnas.forEach((nombreColumna, index) => {
                    registro[nombreColumna] = datos[index] || '';
                });
                
                return registro;
            }).filter(servicio => servicio !== null);
        }, columnasEsperadas);

        console.log(`[SCRAPER] Se encontraron ${servicios.length} registros en ${tipoConsulta}`);

        await browser.close();

        return {
            success: true,
            tipo: tipoConsulta,
            cedula: cedula,
            total: servicios.length,
            columnas: columnasEsperadas,
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
        version: '3.1.0',
        tipo: 'Scraper Multi-Endpoint con Mapeo Correcto',
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
    res.json({
        tipo: tipo,
        columnas: COLUMNAS_POR_TIPO[tipo],
        total: COLUMNAS_POR_TIPO[tipo].length
    });
});

// Ruta raíz con información del API
app.get('/', (req, res) => {
    res.json({
        servicio: 'OnTimeCar Scraper API',
        version: '3.1.0',
        tipo: 'Scraper Multi-Endpoint con Mapeo Correcto',
        endpoints: {
            health: 'GET /health',
            agendamiento: 'GET /consulta/agendamiento?cedula=NUMERO',
            programacion: 'GET /consulta/programacion?cedula=NUMERO',
            panel: 'GET /consulta/panel?cedula=NUMERO',
            preautorizaciones: 'GET /consulta/preautorizaciones?cedula=NUMERO',
            consulta_post: 'POST /consulta (body: { "cedula": "NUMERO", "tipo": "agendamiento|programacion|panel|preautorizaciones" })',
            ver_columnas: 'GET /columnas/:tipo (preautorizaciones|agendamiento|programacion|panel)'
        },
        documentacion: 'Consulta el estado de servicios de On Time Car por cédula en diferentes secciones'
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
            '/columnas/:tipo'
        ]
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor OnTimeCar Scraper iniciado correctamente`);
    console.log(`📡 Escuchando en puerto ${PORT}`);
    console.log(`🌐 Endpoints disponibles:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /consulta/agendamiento?cedula=NUMERO`);
    console.log(`   - GET  /consulta/programacion?cedula=NUMERO`);
    console.log(`   - GET  /consulta/panel?cedula=NUMERO`);
    console.log(`   - GET  /consulta/preautorizaciones?cedula=NUMERO`);
    console.log(`   - POST /consulta (body con cedula y tipo)`);
    console.log(`   - GET  /columnas/:tipo (ver mapeo de columnas)`);
    console.log(`🔐 Credenciales configuradas: ${ONTIMECAR_CONFIG.username}`);
});
