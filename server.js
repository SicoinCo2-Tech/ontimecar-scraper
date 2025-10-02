const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración optimizada
const CONFIG = {
    maxTimeout: 90000, // Timeout máximo total por petición
    navigationTimeout: 30000,
    selectorTimeout: 15000,
    retryAttempts: 2,
    waitAfterSearch: 2000, // Reducido de 5000
    waitAfterPageSize: 1500, // Reducido de 3000
};

const ONTIMECAR_CONFIGS = {
    agendamientos: {
        loginUrl: 'https://app.ontimecar.co/app/home/',
        targetUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
        username: process.env.ONTIMECAR_USERNAME || 'ANDRES',
        password: process.env.ONTIMECAR_PASSWORD || 'IAResponsable',
        tableSelector: '#datatable',
        columnaAutorizacion: 12
    },
    autorizaciones: {
        loginUrl: 'https://app.ontimecar.com.co/Home/',
        targetUrl: 'https://app.ontimecar.com.co/Autorizaciones',
        username: process.env.ONTIMECAR_USERNAME || 'ANDRES',
        password: process.env.ONTIMECAR_PASSWORD || 'IAResponsable',
        tableSelector: '#grdAutorizaciones',
        searchInputSelector: '#txAutorizacionFilterOut'
    }
};

app.use(express.json());

// Pool simple de navegadores para reutilizar
let browserPool = null;
let browserInUse = false;

async function getBrowser() {
    if (!browserPool || !browserPool.isConnected()) {
        browserPool = await puppeteer.launch({
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
                '--disable-software-rasterizer',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }
    return browserPool;
}

// Login optimizado con reintentos
async function loginToOnTimeCar(page, config, attempt = 1) {
    try {
        console.log(`[Intento ${attempt}] Navegando al login...`);
        
        await page.goto(config.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: CONFIG.navigationTimeout 
        });
        
        await page.waitForSelector('input[name="username"]', { timeout: CONFIG.selectorTimeout });
        
        await page.type('input[name="username"]', config.username, { delay: 30 });
        await page.type('input[name="password"]', config.password, { delay: 30 });
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: CONFIG.navigationTimeout 
            }).catch(() => {}) // Ignorar si no hay navegación
        ]);

        // Verificar login exitoso
        const loginSuccess = await page.evaluate(() => {
            return !document.querySelector('input[name="username"]');
        });

        if (!loginSuccess) {
            throw new Error('Login fallido - credenciales incorrectas');
        }

        console.log('✓ Login exitoso');
        return true;

    } catch (error) {
        if (attempt < CONFIG.retryAttempts) {
            console.log(`⚠ Error en login, reintentando... (${attempt}/${CONFIG.retryAttempts})`);
            await page.waitForTimeout(2000);
            return loginToOnTimeCar(page, config, attempt + 1);
        }
        throw error;
    }
}

// Función con timeout global
async function executeWithTimeout(promise, timeoutMs, errorMessage) {
    let timeoutHandle;
    
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(errorMessage || `Operación excedió ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle);
        return result;
    } catch (error) {
        clearTimeout(timeoutHandle);
        throw error;
    }
}

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Scraper Optimizado v4.0',
        browser_status: browserPool && browserPool.isConnected() ? 'ready' : 'not_initialized',
        endpoints: {
            agendamientos: '/consulta/agendamiento?numero_autorizacion=NUMERO',
            autorizaciones: '/consulta/autorizacion?numero=NUMERO'
        }
    });
});

// ============================================
// ENDPOINT 1: Agendamientos (OPTIMIZADO)
// ============================================
app.get('/consulta/agendamiento', async (req, res) => {
    const numeroAutorizacion = req.query.numero_autorizacion || req.query.autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parametro "numero_autorizacion" requerido',
            ejemplo: '/consulta/agendamiento?numero_autorizacion=282664703'
        });
    }

    // Evitar solicitudes concurrentes
    if (browserInUse) {
        return res.status(503).json({ 
            error: 'Servicio ocupado, intente de nuevo en unos segundos',
            retry_after: 5
        });
    }

    browserInUse = true;
    let page;
    const startTime = Date.now();

    try {
        console.log(`[AGENDAMIENTOS] Buscando: ${numeroAutorizacion}`);
        
        const config = ONTIMECAR_CONFIGS.agendamientos;
        
        const scrapingTask = async () => {
            const browser = await getBrowser();
            page = await browser.newPage();
            
            // Configuración de página optimizada
            await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
            await page.setDefaultTimeout(CONFIG.selectorTimeout);
            await page.setViewport({ width: 1366, height: 768 });
            
            // Deshabilitar recursos innecesarios
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Login
            await loginToOnTimeCar(page, config);

            // Navegar a agendamientos
            console.log('Navegando a agendamientos...');
            await page.goto(config.targetUrl, { 
                waitUntil: 'networkidle2',
                timeout: CONFIG.navigationTimeout 
            });
            
            // Esperar DataTable
            await page.waitForSelector(config.tableSelector, { timeout: CONFIG.selectorTimeout });
            
            await page.waitForFunction(() => {
                return typeof $ !== 'undefined' && $('#datatable').DataTable() !== undefined;
            }, { timeout: CONFIG.selectorTimeout });
            
            // Configurar tabla a 100 filas
            console.log('Configurando tabla...');
            await page.evaluate(() => {
                $('#datatable').DataTable().page.len(100).draw();
            });
            
            await page.waitForTimeout(CONFIG.waitAfterPageSize);
            
            // Buscar
            console.log(`Buscando: ${numeroAutorizacion}`);
            await page.evaluate((numAuth) => {
                $('#datatable').DataTable().search(numAuth).draw();
            }, numeroAutorizacion);
            
            await page.waitForTimeout(CONFIG.waitAfterSearch);
            
            // Extraer datos
            const datos = await page.evaluate((numAuthBuscado) => {
                const rows = document.querySelectorAll('#datatable tbody tr');
                const resultados = [];
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length > 10 && !row.classList.contains('dataTables_empty')) {
                        const numAutorizacionFila = cells[12]?.innerText.trim() || '';
                        
                        if (numAutorizacionFila !== numAuthBuscado) return;
                        
                        const getValue = (cell) => {
                            if (!cell) return '';
                            const input = cell.querySelector('input');
                            if (input) return input.value || input.getAttribute('value') || '';
                            return cell.innerText.trim() || '';
                        };

                        resultados.push({
                            acciones: cells[0]?.innerText.trim() || '',
                            check: cells[1]?.innerText.trim() || '',
                            sms: cells[2]?.innerText.trim() || '',
                            fecha_cita: getValue(cells[3]),
                            identificacion: cells[4]?.innerText.trim() || '',
                            nombre: cells[5]?.innerText.trim() || '',
                            telefono: getValue(cells[6]),
                            zona: getValue(cells[7]),
                            ciudad_origen: cells[8]?.innerText.trim() || '',
                            direccion_origen: getValue(cells[9]),
                            ciudad_destino: cells[10]?.innerText.trim() || '',
                            ips_destino: getValue(cells[11]),
                            numero_autorizacion: cells[12]?.innerText.trim() || '',
                            cantidad_servicios: cells[13]?.innerText.trim() || '',
                            fecha_vigencia: cells[14]?.innerText.trim() || '',
                            hora_recogida: getValue(cells[15]),
                            hora_retorno: getValue(cells[16]),
                            nombre_acompanante: getValue(cells[17]),
                            identificacion_acompanante: getValue(cells[18]),
                            parentesco: getValue(cells[19]),
                            telefono_acompanante: getValue(cells[20]),
                            conductor: cells[21]?.innerText.trim() || '',
                            celular_conductor: cells[22]?.innerText.trim() || '',
                            observaciones: getValue(cells[23]),
                            estado: cells[24]?.innerText.trim() || ''
                        });
                    }
                });
                
                return resultados;
            }, numeroAutorizacion);

            await page.close();
            return datos;
        };

        const datos = await executeWithTimeout(
            scrapingTask(),
            CONFIG.maxTimeout,
            'Tiempo máximo de consulta excedido'
        );
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✓ Completado en ${duration}s - ${datos.length} registros`);
        
        if (datos.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron registros',
                numero_autorizacion: numeroAutorizacion,
                duration_seconds: duration
            });
        }
        
        res.json({
            success: true,
            plataforma: 'agendamientos',
            numero_autorizacion: numeroAutorizacion,
            registros_encontrados: datos.length,
            duration_seconds: duration,
            datos: datos
        });

    } catch (error) {
        console.error(`[AGENDAMIENTOS] Error: ${error.message}`);
        
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        res.status(500).json({ 
            error: 'Error al extraer datos',
            detalle: error.message,
            duration_seconds: duration
        });
    } finally {
        browserInUse = false;
    }
});

// ============================================
// ENDPOINT 2: Autorizaciones (OPTIMIZADO)
// ============================================
app.get('/consulta/autorizacion', async (req, res) => {
    const numeroAutorizacion = req.query.numero || req.query.numero_autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parametro "numero" requerido',
            ejemplo: '/consulta/autorizacion?numero=282482633'
        });
    }

    if (browserInUse) {
        return res.status(503).json({ 
            error: 'Servicio ocupado, intente de nuevo en unos segundos',
            retry_after: 5
        });
    }

    browserInUse = true;
    let page;
    const startTime = Date.now();

    try {
        console.log(`[AUTORIZACIONES] Buscando: ${numeroAutorizacion}`);
        
        const config = ONTIMECAR_CONFIGS.autorizaciones;
        
        const scrapingTask = async () => {
            const browser = await getBrowser();
            page = await browser.newPage();
            
            await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
            await page.setDefaultTimeout(CONFIG.selectorTimeout);
            await page.setViewport({ width: 1366, height: 768 });
            
            // Optimización de recursos
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Login
            await loginToOnTimeCar(page, config);

            // Navegar a autorizaciones
            console.log('Navegando a autorizaciones...');
            await page.goto(config.targetUrl, { 
                waitUntil: 'networkidle2',
                timeout: CONFIG.navigationTimeout 
            });
            
            // Esperar Kendo Grid
            await page.waitForSelector(config.tableSelector, { timeout: CONFIG.selectorTimeout });
            
            await page.waitForFunction(() => {
                return typeof $ !== 'undefined' && 
                       typeof kendo !== 'undefined' &&
                       $('#grdAutorizaciones').data('kendoGrid') !== undefined;
            }, { timeout: CONFIG.selectorTimeout });
            
            // Configurar grid
            console.log('Configurando grid...');
            await page.evaluate(() => {
                const grid = $('#grdAutorizaciones').data('kendoGrid');
                if (grid) {
                    grid.dataSource.pageSize(100);
                    grid.dataSource.read();
                }
            });
            
            await page.waitForTimeout(CONFIG.waitAfterPageSize);
            
            // Buscar
            console.log(`Buscando: ${numeroAutorizacion}`);
            await page.evaluate((numero) => {
                const grid = $('#grdAutorizaciones').data('kendoGrid');
                if (grid && grid.dataSource) {
                    grid.dataSource.filter({
                        logic: 'or',
                        filters: [{ field: 'Numero', operator: 'contains', value: numero }]
                    });
                }
            }, numeroAutorizacion);
            
            await page.waitForTimeout(CONFIG.waitAfterSearch);
            
            // Extraer datos
            const datos = await page.evaluate((numBuscado) => {
                const resultados = [];
                
                try {
                    const grid = $('#grdAutorizaciones').data('kendoGrid');
                    if (grid && grid.dataSource) {
                        const data = grid.dataSource.view();
                        
                        data.forEach(item => {
                            if (item.Numero && item.Numero.toString().includes(numBuscado)) {
                                resultados.push({
                                    numero: item.Numero || '',
                                    prescripcion: item.Prescripcion || '',
                                    paciente: item.Paciente || '',
                                    fecha_creacion: item.FechaCreacion || '',
                                    fecha_final_atencion: item.FechaFinalAtencion || '',
                                    estado_autorizacion: item.EstadoAutorizacion || '',
                                    estado_facturacion: item.EstadoFacturacion || '',
                                    cantidad: item.Cantidad || '',
                                    ruta_origen: item.RutaOrigen || '',
                                    ruta_destino: item.RutaDestino || '',
                                    mapiss: item.Mapiss || '',
                                    nombre_diagnostico: item.NombreDiagnostico || '',
                                    cliente: item.Cliente || '',
                                    ips_remitido: item.IpsRemitido || '',
                                    estado: item.Estado || ''
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.log('Error extrayendo datos:', e);
                }
                
                return resultados;
            }, numeroAutorizacion);

            await page.close();
            return datos;
        };

        const datos = await executeWithTimeout(
            scrapingTask(),
            CONFIG.maxTimeout,
            'Tiempo máximo de consulta excedido'
        );
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✓ Completado en ${duration}s - ${datos.length} registros`);
        
        if (datos.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron registros',
                numero: numeroAutorizacion,
                duration_seconds: duration
            });
        }
        
        res.json({
            success: true,
            plataforma: 'autorizaciones',
            numero: numeroAutorizacion,
            registros_encontrados: datos.length,
            duration_seconds: duration,
            datos: datos
        });

    } catch (error) {
        console.error(`[AUTORIZACIONES] Error: ${error.message}`);
        
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        res.status(500).json({ 
            error: 'Error al extraer datos',
            detalle: error.message,
            duration_seconds: duration
        });
    } finally {
        browserInUse = false;
    }
});

// Endpoint para resetear el navegador si es necesario
app.post('/admin/reset-browser', async (req, res) => {
    try {
        if (browserPool && browserPool.isConnected()) {
            await browserPool.close();
        }
        browserPool = null;
        browserInUse = false;
        res.json({ success: true, message: 'Navegador reiniciado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use((err, req, res, next) => {
    res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║          OnTimeCar Scraper OPTIMIZADO v4.0 - ACTIVO             ║
╠══════════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                                  ║
║  Timeout máximo: ${CONFIG.maxTimeout / 1000}s                                         ║
║  Reintentos de login: ${CONFIG.retryAttempts}                                           ║
╠══════════════════════════════════════════════════════════════════╣
║  [1] /consulta/agendamiento?numero_autorizacion=NUM             ║
║  [2] /consulta/autorizacion?numero=NUM                          ║
║  [3] /admin/reset-browser (POST)                                ║
╚══════════════════════════════════════════════════════════════════╝
    `);
});

// Limpieza al cerrar
process.on('SIGTERM', async () => {
    if (browserPool) await browserPool.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    if (browserPool) await browserPool.close();
    process.exit(0);
});
