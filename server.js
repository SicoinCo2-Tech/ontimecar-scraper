// server.js - Scraper Real de OnTimeCar con Puppeteer MEJORADO
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
    consultaUrl: 'https://app.ontimecar.co/app/agendamiento/',
    username: 'ANDRES',
    password: 'IAResponsable'
};

// Función para hacer login y scraping
async function consultarServiciosOnTimeCar(cedula) {
    let browser = null;
    
    try {
        console.log(`[SCRAPER] Iniciando consulta para cédula: ${cedula}`);
        
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

        // Esperar y llenar formulario de login
        console.log('[SCRAPER] Ingresando credenciales...');
        await page.waitForSelector('input[name="username"], input#username, input[type="text"]', { timeout: 10000 });
        
        // Llenar usuario
        await page.type('input[name="username"], input#username, input[type="text"]', ONTIMECAR_CONFIG.username);
        
        // Llenar contraseña
        await page.type('input[name="password"], input#password, input[type="password"]', ONTIMECAR_CONFIG.password);
        
        // Click en botón de login
        await Promise.all([
            page.click('button[type="submit"], input[type="submit"], button.btn-primary'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);

        console.log('[SCRAPER] Login exitoso. Navegando a consultas...');

        // PASO 2: Navegar a la página de agendamientos con filtro de cédula
        const urlConsulta = `${ONTIMECAR_CONFIG.consultaUrl}?page=1&length=100&start_date=&end_date=&search=${cedula}`;
        await page.goto(urlConsulta, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        console.log('[SCRAPER] Esperando a que cargue la tabla...');
        
        // Esperar más tiempo para que cargue la tabla con JavaScript
        await page.waitForTimeout(3000);

        // Intentar con múltiples selectores
        try {
            await page.waitForSelector('table tbody tr, .table tbody tr, .dataTable tbody tr', { timeout: 5000 });
        } catch (e) {
            console.log('[SCRAPER] No se encontró tabla con los selectores estándar');
        }

        // PASO 3: Extraer datos de la tabla
        console.log('[SCRAPER] Extrayendo datos de la tabla...');
        
        const servicios = await page.evaluate(() => {
            // Intentar con diferentes selectores de tabla
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

            return filas.map((fila, index) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                console.log(`Fila ${index}: ${celdas.length} celdas`);
                
                if (celdas.length === 0) return null;

                // Extraer texto de cada celda
                const datos = celdas.map(c => c.innerText?.trim() || '');
                
                // Mapear según las columnas de la imagen
                return {
                    accion: datos[0] || '',
                    fechaSolicitud: datos[1] || '',
                    fechaRecepcion: datos[2] || '',
                    tipoDocumento: datos[3] || '',
                    nombre: datos[4] || '',
                    clase: datos[5] || '',
                    numero: datos[6] || '',
                    estado: datos[7] || '',
                    codigo: datos[8] || '',
                    cantidad: datos[9] || '',
                    prescripcion: datos[10] || '',
                    ciudadOrigen: datos[11] || '',
                    direccionOrigen: datos[12] || '',
                    ciudadDestino: datos[13] || '',
                    direccionDestino: datos[14] || '',
                    eps: datos[15] || '',
                    cantidadServicios: datos[16] || '',
                    subirAutorizacion: datos[17] || '',
                    observaciones: datos[18] || '',
                    nombrePaciente: datos[19] || '',
                    parentesco: datos[20] || '',
                    telefonoDocumentoAco: datos[21] || '',
                    numeroDocumentoAco: datos[22] || '',
                    agendamientos: datos[23] || ''
                };
            }).filter(servicio => servicio !== null && servicio.nombre);
        });

        console.log(`[SCRAPER] Se encontraron ${servicios.length} servicios`);

        // Si no se encontraron servicios, tomar captura para debugging
        if (servicios.length === 0) {
            console.log('[SCRAPER] No se encontraron servicios. Tomando captura para debug...');
            try {
                const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
                console.log('[SCRAPER] Captura tomada (base64)');
            } catch (e) {
                console.log('[SCRAPER] Error al tomar captura:', e.message);
            }
        }

        await browser.close();

        return {
            success: true,
            cedula: cedula,
            total: servicios.length,
            servicios: servicios,
            mensaje: servicios.length > 0 
                ? `Se encontraron ${servicios.length} servicio(s) para la cédula ${cedula}`
                : `No se encontraron servicios para la cédula ${cedula}`
        };

    } catch (error) {
        console.error('[ERROR]', error);
        
        if (browser) {
            await browser.close();
        }

        return {
            success: false,
            error: true,
            mensaje: `Error al consultar servicios: ${error.message}`,
            detalle: error.stack
        };
    }
}

// Health Check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mensaje: 'Servidor OnTimeCar Scraper funcionando correctamente',
        version: '2.1.0',
        tipo: 'Scraper Real con Puppeteer MEJORADO',
        timestamp: new Date().toISOString()
    });
});

// Endpoint principal de consulta (GET)
app.get('/consulta', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }

        console.log(`[API] Recibida consulta para cédula: ${cedula}`);
        const resultado = await consultarServiciosOnTimeCar(cedula);
        
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

// Endpoint POST alternativo
app.post('/consulta', async (req, res) => {
    try {
        const { cedula } = req.body;
        
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El campo "cedula" es requerido en el body'
            });
        }

        console.log(`[API] Recibida consulta para cédula: ${cedula}`);
        const resultado = await consultarServiciosOnTimeCar(cedula);
        
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
        servicio: 'OnTimeCar Scraper API',
        version: '2.1.0',
        tipo: 'Scraper Real con Puppeteer MEJORADO',
        endpoints: {
            health: 'GET /health',
            consulta_get: 'GET /consulta?cedula=NUMERO_CEDULA',
            consulta_post: 'POST /consulta (body: { "cedula": "NUMERO_CEDULA" })'
        },
        documentacion: 'Consulta el estado de servicios de On Time Car por cédula mediante scraping'
    });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: true,
        mensaje: 'Endpoint no encontrado',
        ruta: req.path
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor OnTimeCar Scraper iniciado correctamente`);
    console.log(`📡 Escuchando en puerto ${PORT}`);
    console.log(`🌐 Endpoints disponibles:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /consulta?cedula=NUMERO`);
    console.log(`   - POST /consulta`);
    console.log(`🔐 Credenciales configuradas: ${ONTIMECAR_CONFIG.username}`);
});
