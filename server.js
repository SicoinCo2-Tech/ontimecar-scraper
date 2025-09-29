// server.js - Scraper Real de OnTimeCar con Puppeteer
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

        // Esperar a que cargue la tabla
        await page.waitForSelector('table, .table, [class*="table"]', { timeout: 10000 });

        // PASO 3: Extraer datos de la tabla
        console.log('[SCRAPER] Extrayendo datos de la tabla...');
        
        const servicios = await page.evaluate(() => {
            const filas = Array.from(document.querySelectorAll('table tbody tr, .table tbody tr'));
            
            return filas.map(fila => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                // Mapear columnas según la imagen
                return {
                    fechaSolicitud: celdas[1]?.innerText?.trim() || '',
                    fechaRecepcion: celdas[2]?.innerText?.trim() || '',
                    tipoDocumento: celdas[3]?.innerText?.trim() || '',
                    nombre: celdas[4]?.innerText?.trim() || '',
                    clase: celdas[5]?.innerText?.trim() || '',
                    numero: celdas[6]?.innerText?.trim() || '',
                    estado: celdas[7]?.innerText?.trim() || '',
                    codigo: celdas[8]?.innerText?.trim() || '',
                    cantidad: celdas[9]?.innerText?.trim() || '',
                    prescripcion: celdas[10]?.innerText?.trim() || '',
                    ciudadOrigen: celdas[11]?.innerText?.trim() || '',
                    direccionOrigen: celdas[12]?.innerText?.trim() || '',
                    ciudadDestino: celdas[13]?.innerText?.trim() || '',
                    direccionDestino: celdas[14]?.innerText?.trim() || '',
                    eps: celdas[15]?.innerText?.trim() || '',
                    cantidadServicios: celdas[16]?.innerText?.trim() || '',
                    subirAutorizacion: celdas[17]?.innerText?.trim() || '',
                    observaciones: celdas[18]?.innerText?.trim() || '',
                    nombrePaciente: celdas[19]?.innerText?.trim() || '',
                    parentesco: celdas[20]?.innerText?.trim() || '',
                    telefonoDocumentoAco: celdas[21]?.innerText?.trim() || '',
                    numeroDocumentoAco: celdas[22]?.innerText?.trim() || '',
                    agendamientos: celdas[23]?.innerText?.trim() || ''
                };
            }).filter(servicio => servicio.nombre);
        });

        console.log(`[SCRAPER] Se encontraron ${servicios.length} servicios`);

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
        version: '2.0.0',
        tipo: 'Scraper Real con Puppeteer',
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
        version: '2.0.0',
        tipo: 'Scraper Real con Puppeteer',
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
