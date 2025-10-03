import express from 'express';
import puppeteer from 'puppeteer';

// Configuración optimizada
const CONFIG = {
    maxTimeout: 45000,          // 45s en lugar de 90s
    navigationTimeout: 20000,   // 20s
    selectorTimeout: 10000,     // 10s
    retryAttempts: 1,           // un solo intento
    waitAfterSearch: 1000,      // 1s
    waitAfterPageSize: 800,     // 0.8s
};

// Configuraciones por plataforma
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

// Variables globales
let browserPool = null;
let browserInUse = false;

// Lanzar navegador (una sola instancia)
async function getBrowser() {
    if (!browserPool) {
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
                '--disable-extensions'
            ]
        });
    }
    return browserPool;
}

// Login
async function loginToOnTimeCar(page, config, attempt = 1) {
    try {
        console.log(`[Intento ${attempt}] Navegando al login...`);

        await page.goto(config.loginUrl, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.navigationTimeout
        });

        await page.waitForSelector('input[name="username"]', { timeout: CONFIG.selectorTimeout });

        await page.evaluate(() => {
            const username = document.querySelector('input[name="username"]');
            const password = document.querySelector('input[name="password"]');
            if (username) username.value = '';
            if (password) password.value = '';
        });

        await page.type('input[name="username"]', config.username, { delay: 30 });
        await page.type('input[name="password"]', config.password, { delay: 30 });

        console.log('Enviando credenciales...');

        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({
                waitUntil: 'domcontentloaded',
                timeout: 15000
            }).catch(() => {
                console.log('No hubo navegación después del login, continuando...');
            })
        ]);

        await page.waitForTimeout(2000);

        const loginSuccess = await page.evaluate(() => {
            const hasLoginForm = !!document.querySelector('input[name="username"]');
            const hasErrorMessage = document.body.innerText.toLowerCase().includes('error') ||
                                    document.body.innerText.toLowerCase().includes('incorrect');
            return !hasLoginForm && !hasErrorMessage;
        });

        if (!loginSuccess) throw new Error('Login fallido');

        console.log('✓ Login exitoso');
        return true;

    } catch (error) {
        console.error(`Error en login (intento ${attempt}):`, error.message);
        if (attempt < CONFIG.retryAttempts) {
            console.log(`⚠ Reintentando login...`);
            await page.waitForTimeout(2000);
            return loginToOnTimeCar(page, config, attempt + 1);
        }
        throw new Error(`Login fallido: ${error.message}`);
    }
}

// Timeout wrapper
async function executeWithTimeout(promise, timeoutMs, errorMessage) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
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

// Express app
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Scraper v4.3 Optimizado',
        browser_status: browserPool ? 'ready' : 'not_initialized',
        browser_in_use: browserInUse
    });
});

// --- Consulta Agendamiento ---
app.get('/consulta/agendamiento', async (req, res) => {
    const numeroAutorizacion = req.query.numero_autorizacion || req.query.autorizacion;
    if (!numeroAutorizacion) return res.status(400).json({ error: 'Parametro "numero_autorizacion" requerido' });

    if (browserInUse) return res.status(503).json({ error: 'Servicio ocupado', retry_after_seconds: 5 });

    browserInUse = true;
    let page;
    const startTime = Date.now();

    try {
        const config = ONTIMECAR_CONFIGS.agendamientos;
        const scrapingTask = async () => {
            const browser = await getBrowser();
            page = await browser.newPage();

            await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
            await page.setViewport({ width: 1366, height: 768 });

            await loginToOnTimeCar(page, config);

            // Solo después del login: bloquear imágenes/CSS
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            console.log('Navegando a agendamientos...');
            await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });

            await page.waitForSelector(config.tableSelector, { timeout: CONFIG.selectorTimeout });

            console.log(`Buscando: ${numeroAutorizacion}`);
            await page.evaluate((numAuth) => {
                $('#datatable').DataTable().search(numAuth).draw();
            }, numeroAutorizacion);

            await page.waitForTimeout(CONFIG.waitAfterSearch);

            const datos = await page.evaluate((numAuthBuscado) => {
                const resultados = [];
                const rows = document.querySelectorAll('#datatable tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 10 && !row.classList.contains('dataTables_empty')) {
                        const numAutorizacionFila = cells[12]?.innerText.trim() || '';
                        if (numAutorizacionFila !== numAuthBuscado) return;
                        resultados.push({ numero_autorizacion: numAutorizacionFila, nombre: cells[5]?.innerText.trim() || '' });
                    }
                });
                return resultados;
            }, numeroAutorizacion);

            await page.close();
            return datos;
        };

        const datos = await executeWithTimeout(scrapingTask(), CONFIG.maxTimeout, 'Timeout excedido');
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!datos.length) {
            return res.status(404).json({ error: 'No se encontraron registros', numero_autorizacion: numeroAutorizacion, duration_seconds: duration });
        }

        res.json({ success: true, plataforma: 'agendamientos', registros: datos, duration_seconds: duration });

    } catch (error) {
        if (page && !page.isClosed()) await page.close();
        res.status(500).json({ error: error.message });
    } finally {
        browserInUse = false;
    }
});

// --- Consulta Autorizacion ---
app.get('/consulta/autorizacion', async (req, res) => {
    const numeroAutorizacion = req.query.numero || req.query.numero_autorizacion;
    if (!numeroAutorizacion) return res.status(400).json({ error: 'Parametro "numero" requerido' });

    if (browserInUse) return res.status(503).json({ error: 'Servicio ocupado', retry_after_seconds: 5 });

    browserInUse = true;
    let page;
    const startTime = Date.now();

    try {
        const config = ONTIMECAR_CONFIGS.autorizaciones;
        const scrapingTask = async () => {
            const browser = await getBrowser();
            page = await browser.newPage();

            await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
            await page.setViewport({ width: 1366, height: 768 });

            await loginToOnTimeCar(page, config);

            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
            await page.waitForSelector(config.tableSelector, { timeout: CONFIG.selectorTimeout });

            console.log(`Buscando: ${numeroAutorizacion}`);
            await page.evaluate((numero) => {
                const grid = $('#grdAutorizaciones').data('kendoGrid');
                if (grid) {
                    grid.dataSource.filter({
                        logic: 'or',
                        filters: [{ field: 'Numero', operator: 'contains', value: numero }]
                    });
                }
            }, numeroAutorizacion);

            await page.waitForTimeout(CONFIG.waitAfterSearch);

            const datos = await page.evaluate((numBuscado) => {
                const resultados = [];
                const grid = $('#grdAutorizaciones').data('kendoGrid');
                if (grid && grid.dataSource) {
                    const data = grid.dataSource.view();
                    data.forEach(item => {
                        if (item.Numero && item.Numero.toString().includes(numBuscado)) {
                            resultados.push({ numero: item.Numero, paciente: item.Paciente || '' });
                        }
                    });
                }
                return resultados;
            }, numeroAutorizacion);

            await page.close();
            return datos;
        };

        const datos = await executeWithTimeout(scrapingTask(), CONFIG.maxTimeout, 'Timeout excedido');
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!datos.length) {
            return res.status(404).json({ error: 'No se encontraron registros', numero: numeroAutorizacion, duration_seconds: duration });
        }

        res.json({ success: true, plataforma: 'autorizaciones', registros: datos, duration_seconds: duration });

    } catch (error) {
        if (page && !page.isClosed()) await page.close();
        res.status(500).json({ error: error.message });
    } finally {
        browserInUse = false;
    }
});

// Reset navegador
app.post('/admin/reset-browser', async (req, res) => {
    try {
        if (browserPool) await browserPool.close();
        browserPool = null;
        browserInUse = false;
        res.json({ success: true, message: 'Navegador reiniciado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handler
app.use((err, req, res, next) => {
    res.status(500).json({ error: 'Error interno' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});

process.on('SIGTERM', async () => {
    if (browserPool) await browserPool.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    if (browserPool) await browserPool.close();
    process.exit(0);
});
