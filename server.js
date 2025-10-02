app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Scraper Optimizado v4.0',
        browser_status: browserPool && browserPool.isConnected() ? 'ready' : 'not_initialized',
        browser_in_use: browserInUse,
        endpoints: {
            agendamientos: '/consulta/agendamiento?numero_autorizacion=NUMERO',
            autorizaciones: '/consulta/autorizacion?numero=NUMERO'
        }
    });
});

// Endpoint de diagnóstico para probar login
app.get('/diagnostico/test-login', async (req, res) => {
    const plataforma = req.query.plataforma || 'agendamientos';
    
    if (!['agendamientos', 'autorizaciones'].includes(plataforma)) {
        return res.status(400).json({ 
            error: 'Plataforma debe ser "agendamientos" o "autorizaciones"'
        });
    }

    if (browserInUse) {
        return res.status(503).json({ 
            error: 'Servicio ocupado',
            retry_after_seconds: 5
        });
    }

    browserInUse = true;
    let page;
    const logs = [];
    const startTime = Date.now();

    try {
        const config = ONTIMECAR_CONFIGS[plataforma];
        logs.push(`Iniciando test de login para: ${plataforma}`);
        
        const browser = await getBrowser();
        page = await browser.newPage();
        
        await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
        await page.setViewport({ width: 1366, height: 768 });
        
        // Capturar logs del navegador
        page.on('console', msg => logs.push(`BROWSER: ${msg.text()}`));
        page.on('pageerror', error => logs.push(`ERROR: ${error.message}`));
        
        logs.push('Intentando login...');
        await loginToOnTimeCar(page, config);
        logs.push('✓ Login exitoso');
        
        logs.push('Navegando a página objetivo...');
        await page.goto(config.targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.navigationTimeout 
        });
        logs.push('✓ Página cargada');
        
        // Verificar elementos específicos
        if (plataforma === 'agendamientos') {
            const hasTable = await page.$(config.tableSelector);
            logs.push(`Tabla encontrada: ${hasTable ? 'SÍ' : 'NO'}`);
            
            const hasDataTable = await page.evaluate(() => {
                return typeof $ !== 'undefined' && typeof $.fn.DataTable !== 'undefined';
            });
            logs.push(`jQuery DataTable disponible: ${hasDataTable ? 'SÍ' : 'NO'}`);
        } else {
            const hasGrid = await page.$(config.tableSelector);
            logs.push(`Grid encontrado: ${hasGrid ? 'SÍ' : 'NO'}`);
            
            const hasKendo = await page.evaluate(() => {
                return typeof kendo !== 'undefined';
            });
            logs.push(`Kendo UI disponible: ${hasKendo ? 'SÍ' : 'NO'}`);
        }
        
        await page.close();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        res.json({
            success: true,
            plataforma: plataforma,
            duration_seconds: duration,
            logs: logs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logs.push(`ERROR FATAL: ${error.message}`);
        
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        res.status(500).json({
            success: false,
            plataforma: plataforma,
            error: error.message,
            duration_seconds: duration,
            logs: logs,
            timestamp: new Date().toISOString()
        });
    } finally {
        browserInUse = false;
    }
});const express = require('express');
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
        
        // Navegar con múltiples estrategias de espera
        await page.goto(config.loginUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.navigationTimeout 
        });
        
        // Esperar a que la página esté realmente lista
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 }).catch(() => {});
        
        await page.waitForSelector('input[name="username"]', { timeout: CONFIG.selectorTimeout });
        
        // Limpiar campos antes de escribir
        await page.evaluate(() => {
            const username = document.querySelector('input[name="username"]');
            const password = document.querySelector('input[name="password"]');
            if (username) username.value = '';
            if (password) password.value = '';
        });
        
        await page.type('input[name="username"]', config.username, { delay: 30 });
        await page.type('input[name="password"]', config.password, { delay: 30 });
        
        console.log('Enviando credenciales...');
        
        // Click y esperar con timeout más largo
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ 
                waitUntil: 'domcontentloaded', 
                timeout: 40000 
            }).catch(() => {
                console.log('No hubo navegación después del login, continuando...');
            })
        ]);

        // Dar tiempo extra para que se procese el login
        await page.waitForTimeout(3000);

        // Verificar login exitoso de múltiples formas
        const loginSuccess = await page.evaluate(() => {
            const hasLoginForm = !!document.querySelector('input[name="username"]');
            const hasErrorMessage = document.body.innerText.toLowerCase().includes('error') || 
                                   document.body.innerText.toLowerCase().includes('incorrect');
            return !hasLoginForm && !hasErrorMessage;
        });

        if (!loginSuccess) {
            throw new Error('Login fallido - credenciales incorrectas o página no cargó');
        }

        console.log('✓ Login exitoso');
        return true;

    } catch (error) {
        console.error(`Error en login (intento ${attempt}):`, error.message);
        
        if (attempt < CONFIG.retryAttempts) {
            console.log(`⚠ Reintentando login... (${attempt + 1}/${CONFIG.retryAttempts})`);
            await page.waitForTimeout(3000);
            return loginToOnTimeCar(page, config, attempt + 1);
        }
        throw new Error(`Login fallido después de ${CONFIG.retryAttempts} intentos: ${error.message}`);
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

    // Evitar solicitudes concurrentes con timeout
    const maxWaitTime = 10000; // 10 segundos máximo esperando
    const startWait = Date.now();
    
    while (browserInUse && (Date.now() - startWait) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (browserInUse) {
        return res.status(503).json({ 
            error: 'Servicio ocupado, intente de nuevo',
            retry_after_seconds: 5
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
            
            // User agent realista
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Deshabilitar recursos innecesarios SOLO después de login
            let loginCompleted = false;
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                // Durante login, permitir todo
                if (!loginCompleted) {
                    req.continue();
                    return;
                }
                // Después de login, optimizar
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Login
            await loginToOnTimeCar(page, config);
            loginCompleted = true;

            // Navegar a agendamientos
            console.log('Navegando a agendamientos...');
            await page.goto(config.targetUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.navigationTimeout 
            });
            
            // Esperar que la página esté lista
            await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 }).catch(() => {});
            
            // Esperar DataTable con reintentos
            console.log('Esperando DataTable...');
            let dataTableReady = false;
            for (let i = 0; i < 3; i++) {
                await page.waitForSelector(config.tableSelector, { timeout: CONFIG.selectorTimeout }).catch(() => {});
                
                dataTableReady = await page.evaluate(() => {
                    return typeof $ !== 'undefined' && 
                           typeof $.fn.DataTable !== 'undefined' &&
                           $('#datatable').length > 0;
                }).catch(() => false);
                
                if (dataTableReady) {
                    const hasDataTable = await page.evaluate(() => {
                        try {
                            return $('#datatable').DataTable() !== undefined;
                        } catch (e) {
                            return false;
                        }
                    });
                    if (hasDataTable) break;
                }
                
                console.log(`DataTable no listo, reintento ${i + 1}/3...`);
                await page.waitForTimeout(2000);
            }
            
            if (!dataTableReady) {
                throw new Error('DataTable no se inicializó correctamente');
            }
            
            // Configurar tabla a 100 filas
            console.log('Configurando tabla a 100 filas...');
            await page.evaluate(() => {
                const table = $('#datatable').DataTable();
                table.page.len(100).draw();
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

    // Evitar solicitudes concurrentes con timeout
    const maxWaitTime = 10000;
    const startWait = Date.now();
    
    while (browserInUse && (Date.now() - startWait) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (browserInUse) {
        return res.status(503).json({ 
            error: 'Servicio ocupado, intente de nuevo',
            retry_after_seconds: 5
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
            
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Optimización de recursos
            let loginCompleted = false;
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (!loginCompleted) {
                    req.continue();
                    return;
                }
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Login
            await loginToOnTimeCar(page, config);
            loginCompleted = true;

            // Navegar a autorizaciones
            console.log('Navegando a autorizaciones...');
            await page.goto(config.targetUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.navigationTimeout 
            });
            
            await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 }).catch(() => {});
            
            // Esperar Kendo Grid con reintentos
            console.log('Esperando Kendo Grid...');
            let kendoReady = false;
            for (let i = 0; i < 3; i++) {
                await page.waitForSelector(config.tableSelector, { timeout: CONFIG.selectorTimeout }).catch(() => {});
                
                kendoReady = await page.evaluate(() => {
                    return typeof $ !== 'undefined' && 
                           typeof kendo !== 'undefined' &&
                           $('#grdAutorizaciones').length > 0;
                }).catch(() => false);
                
                if (kendoReady) {
                    const hasGrid = await page.evaluate(() => {
                        try {
                            return $('#grdAutorizaciones').data('kendoGrid') !== undefined;
                        } catch (e) {
                            return false;
                        }
                    });
                    if (hasGrid) break;
                }
                
                console.log(`Kendo Grid no listo, reintento ${i + 1}/3...`);
                await page.waitForTimeout(2000);
            }
            
            if (!kendoReady) {
                throw new Error('Kendo Grid no se inicializó correctamente');
            }
            
            // Configurar grid
            console.log('Configurando grid a 100 filas...');
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

// Endpoint de diagnóstico
app.get('/diagnostico/test', async (req, res) => {
    const plataforma = req.query.plataforma || 'agendamientos';
    
    if (!['agendamientos', 'autorizaciones'].includes(plataforma)) {
        return res.status(400).json({ 
            error: 'Plataforma debe ser "agendamientos" o "autorizaciones"'
        });
    }

    const maxWaitTime = 10000;
    const startWait = Date.now();
    
    while (browserInUse && (Date.now() - startWait) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (browserInUse) {
        return res.status(503).json({ 
            error: 'Servicio ocupado',
            retry_after_seconds: 5
        });
    }

    browserInUse = true;
    let page;
    const logs = [];
    const startTime = Date.now();

    try {
        const config = ONTIMECAR_CONFIGS[plataforma];
        logs.push(`[${new Date().toISOString()}] Test para: ${plataforma}`);
        
        logs.push('Obteniendo navegador...');
        const browser = await getBrowser();
        page = await browser.newPage();
        
        await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
        await page.setViewport({ width: 1366, height: 768 });
        
        page.on('console', msg => logs.push(`BROWSER: ${msg.text()}`));
        page.on('pageerror', error => logs.push(`PAGE ERROR: ${error.message}`));
        
        logs.push('Iniciando login...');
        await loginToOnTimeCar(page, config);
        logs.push('✓ Login completado exitosamente');
        
        logs.push(`Navegando a: ${config.targetUrl}`);
        await page.goto(config.targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.navigationTimeout 
        });
        logs.push('✓ Navegación completada');
        
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 }).catch(() => {
            logs.push('WARN: document.readyState no llegó a "complete"');
        });
        
        // Verificaciones específicas por plataforma
        if (plataforma === 'agendamientos') {
            logs.push('Verificando DataTable...');
            
            const hasTable = await page.$(config.tableSelector);
            logs.push(`- Selector tabla (${config.tableSelector}): ${hasTable ? '✓ ENCONTRADO' : '✗ NO ENCONTRADO'}`);
            
            const jQueryAvailable = await page.evaluate(() => typeof $ !== 'undefined');
            logs.push(`- jQuery disponible: ${jQueryAvailable ? '✓ SÍ' : '✗ NO'}`);
            
            if (jQueryAvailable) {
                const dataTableAvailable = await page.evaluate(() => typeof $.fn.DataTable !== 'undefined');
                logs.push(`- DataTable plugin: ${dataTableAvailable ? '✓ SÍ' : '✗ NO'}`);
                
                if (dataTableAvailable) {
                    const tableInitialized = await page.evaluate(() => {
                        try {
                            return $('#datatable').DataTable() !== undefined;
                        } catch (e) {
                            return false;
                        }
                    });
                    logs.push(`- Tabla inicializada: ${tableInitialized ? '✓ SÍ' : '✗ NO'}`);
                }
            }
            
        } else {
            logs.push('Verificando Kendo Grid...');
            
            const hasGrid = await page.$(config.tableSelector);
            logs.push(`- Selector grid (${config.tableSelector}): ${hasGrid ? '✓ ENCONTRADO' : '✗ NO ENCONTRADO'}`);
            
            const jQueryAvailable = await page.evaluate(() => typeof $ !== 'undefined');
            logs.push(`- jQuery disponible: ${jQueryAvailable ? '✓ SÍ' : '✗ NO'}`);
            
            const kendoAvailable = await page.evaluate(() => typeof kendo !== 'undefined');
            logs.push(`- Kendo UI disponible: ${kendoAvailable ? '✓ SÍ' : '✗ NO'}`);
            
            if (jQueryAvailable && kendoAvailable) {
                const gridInitialized = await page.evaluate(() => {
                    try {
                        return $('#grdAutorizaciones').data('kendoGrid') !== undefined;
                    } catch (e) {
                        return false;
                    }
                });
                logs.push(`- Grid inicializado: ${gridInitialized ? '✓ SÍ' : '✗ NO'}`);
            }
        }
        
        // Capturar HTML de la tabla para debugging
        const tableHTML = await page.evaluate((selector) => {
            const table = document.querySelector(selector);
            return table ? table.outerHTML.substring(0, 500) : 'NO ENCONTRADA';
        }, config.tableSelector);
        logs.push(`- HTML preview: ${tableHTML.substring(0, 200)}...`);
        
        await page.close();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logs.push(`✓ Test completado en ${duration}s`);
        
        res.json({
            success: true,
            plataforma: plataforma,
            duration_seconds: duration,
            logs: logs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logs.push(`✗ ERROR FATAL: ${error.message}`);
        logs.push(`Stack: ${error.stack}`);
        
        if (page) {
            try { 
                const url = await page.url();
                logs.push(`URL actual: ${url}`);
                await page.close(); 
            } catch (e) {
                logs.push(`Error cerrando página: ${e.message}`);
            }
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        res.status(500).json({
            success: false,
            plataforma: plataforma,
            error: error.message,
            duration_seconds: duration,
            logs: logs,
            timestamp: new Date().toISOString()
        });
    } finally {
        browserInUse = false;
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
