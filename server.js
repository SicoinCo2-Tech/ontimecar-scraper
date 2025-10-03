import express from 'express';
import puppeteer from 'puppeteer';

// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
    maxTimeout: 45000,
    navigationTimeout: 20000,
    selectorTimeout: 10000,
    retryAttempts: 2,
    waitAfterSearch: 1500,
};

// Validar credenciales
if (!process.env.ONTIMECAR_USERNAME || !process.env.ONTIMECAR_PASSWORD) {
    console.error('❌ ERROR: Faltan variables de entorno ONTIMECAR_USERNAME y ONTIMECAR_PASSWORD');
    process.exit(1);
}

const ONTIMECAR_CONFIGS = {
    agendamientos: {
        loginUrl: 'https://app.ontimecar.co/app/home/',
        targetUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
        username: process.env.ONTIMECAR_USERNAME,
        password: process.env.ONTIMECAR_PASSWORD,
        tableSelector: '#datatable',
        columnaAutorizacion: 12
    },
    autorizaciones: {
        loginUrl: 'https://app.ontimecar.com.co/Home/',
        targetUrl: 'https://app.ontimecar.com.co/Autorizaciones',
        username: process.env.ONTIMECAR_USERNAME,
        password: process.env.ONTIMECAR_PASSWORD,
        tableSelector: '#grdAutorizaciones',
    }
};

// ============================================
// GESTIÓN DE NAVEGADOR (SIMPLIFICADA)
// ============================================
let browser = null;
let activeSessions = 0;
const MAX_CONCURRENT = 3;

async function getBrowser() {
    if (!browser) {
        console.log('🚀 Iniciando navegador...');
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-web-security'
            ]
        });
    }
    return browser;
}

async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        activeSessions = 0;
    }
}

// ============================================
// UTILIDADES
// ============================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withTimeout(promise, timeoutMs, errorMsg) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });
    
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ============================================
// LOGIN
// ============================================
async function loginToOnTimeCar(page, config, attempt = 1) {
    try {
        console.log(`[Login Intento ${attempt}] Navegando a: ${config.loginUrl}`);

        await page.goto(config.loginUrl, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.navigationTimeout
        });

        // Esperar formulario
        await page.waitForSelector('input[name="username"]', { 
            timeout: CONFIG.selectorTimeout,
            visible: true 
        });
        
        await sleep(500);

        // Limpiar e ingresar credenciales
        await page.evaluate(() => {
            document.querySelector('input[name="username"]').value = '';
            document.querySelector('input[name="password"]').value = '';
        });

        await page.type('input[name="username"]', config.username, { delay: 50 });
        await page.type('input[name="password"]', config.password, { delay: 50 });

        console.log('📝 Credenciales ingresadas, enviando...');

        // Click y esperar navegación
        const navigationPromise = page.waitForNavigation({ 
            waitUntil: 'networkidle2',
            timeout: 15000 
        }).catch(() => null);

        await page.click('button[type="submit"]');
        await navigationPromise;
        
        await sleep(2000);

        // Verificar login exitoso
        const isLoggedIn = await page.evaluate(() => {
            const hasLoginForm = !!document.querySelector('input[name="username"]');
            const bodyText = document.body.innerText.toLowerCase();
            const hasError = bodyText.includes('error') || 
                           bodyText.includes('incorrect') || 
                           bodyText.includes('inválid') ||
                           bodyText.includes('incorrecto');
            return !hasLoginForm && !hasError;
        });

        if (!isLoggedIn) {
            throw new Error('Login fallido: credenciales incorrectas o sesión no iniciada');
        }

        console.log('✅ Login exitoso');
        return true;

    } catch (error) {
        console.error(`❌ Error en login (intento ${attempt}):`, error.message);
        
        if (attempt < CONFIG.retryAttempts) {
            console.log('⏳ Reintentando en 3 segundos...');
            await sleep(3000);
            return loginToOnTimeCar(page, config, attempt + 1);
        }
        
        throw new Error(`Login fallido después de ${CONFIG.retryAttempts} intentos: ${error.message}`);
    }
}

// ============================================
// SCRAPING - AGENDAMIENTOS
// ============================================
async function scrapAgendamiento(numeroAutorizacion) {
    if (activeSessions >= MAX_CONCURRENT) {
        throw new Error('Servicio ocupado, intente en unos segundos');
    }

    activeSessions++;
    let page = null;

    try {
        const config = ONTIMECAR_CONFIGS.agendamientos;
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // Configurar página
        await page.setViewport({ width: 1366, height: 768 });
        await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
        
        // Bloquear recursos pesados
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Login
        await loginToOnTimeCar(page, config);

        // Ir a agendamientos
        console.log('📄 Navegando a agendamientos...');
        await page.goto(config.targetUrl, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.navigationTimeout
        });

        // Esperar tabla
        await page.waitForSelector(config.tableSelector, { 
            timeout: CONFIG.selectorTimeout 
        });

        await sleep(1000);

        // Verificar DataTable
        const hasDataTable = await page.evaluate(() => {
            return typeof window.$ !== 'undefined' && 
                   typeof window.$.fn.DataTable !== 'undefined' &&
                   window.$('#datatable').length > 0;
        });

        if (!hasDataTable) {
            throw new Error('DataTable no está disponible en la página');
        }

        console.log(`🔍 Buscando autorización: ${numeroAutorizacion}`);

        // Realizar búsqueda
        await page.evaluate((numAuth) => {
            const table = window.$('#datatable').DataTable();
            table.search(numAuth).draw();
        }, numeroAutorizacion);

        await sleep(CONFIG.waitAfterSearch);

        // Extraer datos
        const datos = await page.evaluate((numAuth, colIndex) => {
            const resultados = [];
            const rows = document.querySelectorAll('#datatable tbody tr');
            
            for (const row of rows) {
                if (row.classList.contains('dataTables_empty')) continue;
                
                const cells = row.querySelectorAll('td');
                if (cells.length <= colIndex) continue;
                
                const numAutorizacion = cells[colIndex]?.innerText.trim();
                
                if (numAutorizacion === numAuth) {
                    resultados.push({
                        numero_autorizacion: numAutorizacion,
                        nombre: cells[5]?.innerText.trim() || 'N/A',
                        fecha: cells[3]?.innerText.trim() || 'N/A',
                        estado: cells[7]?.innerText.trim() || 'N/A'
                    });
                }
            }
            
            return resultados;
        }, numeroAutorizacion, config.columnaAutorizacion);

        console.log(`✅ Encontrados ${datos.length} registros`);
        return datos;

    } finally {
        if (page) {
            await page.close().catch(err => 
                console.error('Error cerrando página:', err.message)
            );
        }
        activeSessions--;
    }
}

// ============================================
// SCRAPING - AUTORIZACIONES
// ============================================
async function scrapAutorizacion(numeroAutorizacion) {
    if (activeSessions >= MAX_CONCURRENT) {
        throw new Error('Servicio ocupado, intente en unos segundos');
    }

    activeSessions++;
    let page = null;

    try {
        const config = ONTIMECAR_CONFIGS.autorizaciones;
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        await page.setViewport({ width: 1366, height: 768 });
        await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await loginToOnTimeCar(page, config);

        console.log('📄 Navegando a autorizaciones...');
        await page.goto(config.targetUrl, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.navigationTimeout
        });

        await page.waitForSelector(config.tableSelector, { 
            timeout: CONFIG.selectorTimeout 
        });

        await sleep(1000);

        // Verificar Kendo Grid
        const hasKendoGrid = await page.evaluate(() => {
            return typeof window.$ !== 'undefined' && 
                   typeof window.kendo !== 'undefined' &&
                   window.$('#grdAutorizaciones').data('kendoGrid') !== undefined;
        });

        if (!hasKendoGrid) {
            throw new Error('Kendo Grid no está disponible');
        }

        console.log(`🔍 Buscando autorización: ${numeroAutorizacion}`);

        // Filtrar grid
        await page.evaluate((numero) => {
            const grid = window.$('#grdAutorizaciones').data('kendoGrid');
            grid.dataSource.filter({
                logic: 'or',
                filters: [{ 
                    field: 'Numero', 
                    operator: 'contains', 
                    value: numero 
                }]
            });
        }, numeroAutorizacion);

        await sleep(CONFIG.waitAfterSearch);

        // Extraer datos
        const datos = await page.evaluate((numBuscado) => {
            const resultados = [];
            const grid = window.$('#grdAutorizaciones').data('kendoGrid');
            
            if (grid && grid.dataSource) {
                const items = grid.dataSource.view();
                
                for (const item of items) {
                    if (item.Numero && item.Numero.toString().includes(numBuscado)) {
                        resultados.push({
                            numero: item.Numero,
                            paciente: item.Paciente || 'N/A',
                            fecha: item.Fecha || 'N/A',
                            estado: item.Estado || 'N/A'
                        });
                    }
                }
            }
            
            return resultados;
        }, numeroAutorizacion);

        console.log(`✅ Encontrados ${datos.length} registros`);
        return datos;

    } finally {
        if (page) {
            await page.close().catch(err => 
                console.error('Error cerrando página:', err.message)
            );
        }
        activeSessions--;
    }
}

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: 'v5.1-simplified',
        browser_initialized: browser !== null,
        active_sessions: activeSessions,
        max_concurrent: MAX_CONCURRENT
    });
});

// Endpoint: Agendamiento
app.get('/consulta/agendamiento', async (req, res) => {
    const numeroAutorizacion = req.query.numero_autorizacion || req.query.autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parámetro requerido: numero_autorizacion',
            ejemplo: '/consulta/agendamiento?numero_autorizacion=12345'
        });
    }

    const startTime = Date.now();

    try {
        const datos = await withTimeout(
            scrapAgendamiento(numeroAutorizacion),
            CONFIG.maxTimeout,
            'Timeout: operación tardó más de 45 segundos'
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!datos || datos.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No se encontraron registros',
                numero_autorizacion: numeroAutorizacion,
                duration_seconds: duration
            });
        }

        res.json({
            success: true,
            plataforma: 'agendamientos',
            registros: datos,
            total: datos.length,
            duration_seconds: duration
        });

    } catch (error) {
        console.error('❌ Error en /consulta/agendamiento:', error.message);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        res.status(500).json({
            success: false,
            error: error.message,
            numero_autorizacion: numeroAutorizacion,
            duration_seconds: duration
        });
    }
});

// Endpoint: Autorización
app.get('/consulta/autorizacion', async (req, res) => {
    const numeroAutorizacion = req.query.numero || req.query.numero_autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parámetro requerido: numero',
            ejemplo: '/consulta/autorizacion?numero=12345'
        });
    }

    const startTime = Date.now();

    try {
        const datos = await withTimeout(
            scrapAutorizacion(numeroAutorizacion),
            CONFIG.maxTimeout,
            'Timeout: operación tardó más de 45 segundos'
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!datos || datos.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No se encontraron registros',
                numero: numeroAutorizacion,
                duration_seconds: duration
            });
        }

        res.json({
            success: true,
            plataforma: 'autorizaciones',
            registros: datos,
            total: datos.length,
            duration_seconds: duration
        });

    } catch (error) {
        console.error('❌ Error en /consulta/autorizacion:', error.message);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        res.status(500).json({
            success: false,
            error: error.message,
            numero: numeroAutorizacion,
            duration_seconds: duration
        });
    }
});

// Admin: Reset browser
app.post('/admin/reset-browser', async (req, res) => {
    try {
        console.log('🔄 Reiniciando navegador...');
        await closeBrowser();
        res.json({ 
            success: true, 
            message: 'Navegador reiniciado correctamente' 
        });
    } catch (error) {
        console.error('Error reiniciando navegador:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Admin: Stats
app.get('/admin/stats', (req, res) => {
    res.json({
        browser_initialized: browser !== null,
        active_sessions: activeSessions,
        max_concurrent: MAX_CONCURRENT,
        uptime_seconds: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        pid: process.pid,
        node_version: process.version
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        endpoints_disponibles: [
            'GET /health',
            'GET /consulta/agendamiento?numero_autorizacion=XXX',
            'GET /consulta/autorizacion?numero=XXX',
            'POST /admin/reset-browser',
            'GET /admin/stats'
        ]
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    res.status(500).json({ 
        success: false,
        error: 'Error interno del servidor'
    });
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================
const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  🚀 OnTimeCar Scraper v5.1            ║
║                                        ║
║  Puerto: ${PORT}                           ║
║  Max Concurrent: ${MAX_CONCURRENT}                    ║
║  Status: ✅ ACTIVO                    ║
║                                        ║
║  Endpoints:                            ║
║  • GET  /health                        ║
║  • GET  /consulta/agendamiento         ║
║  • GET  /consulta/autorizacion         ║
║  • POST /admin/reset-browser           ║
║  • GET  /admin/stats                   ║
╚════════════════════════════════════════╝
    `);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
async function gracefulShutdown(signal) {
    console.log(`\n⚠️  ${signal} recibido, cerrando servidor...`);
    
    server.close(async () => {
        console.log('✅ HTTP server cerrado');
        
        try {
            await closeBrowser();
            console.log('✅ Navegador cerrado');
            console.log('👋 Shutdown completado');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error en shutdown:', error);
            process.exit(1);
        }
    });

    // Force exit después de 30s
    setTimeout(() => {
        console.error('⚠️  Shutdown forzado (timeout)');
        process.exit(1);
    }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});
