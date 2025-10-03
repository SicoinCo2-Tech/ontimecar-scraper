// ============================================
// DEPENDENCIAS
// ============================================
import 'dotenv/config';
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
    waitAfterPagination: 2000,
    defaultDaysBack: 30,
};

// Validar credenciales
if (!process.env.ONTIMECAR_USERNAME || !process.env.ONTIMECAR_PASSWORD) {
    console.error('ERROR: Debes definir ONTIMECAR_USERNAME y ONTIMECAR_PASSWORD en el archivo .env');
    process.exit(1);
}

const ONTIMECAR_CONFIGS = {
    agendamientos: {
        loginUrl: 'https://app.ontimecar.co/app/home/',
        targetUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
        username: process.env.ONTIMECAR_USERNAME,
        password: process.env.ONTIMECAR_PASSWORD,
        tableSelector: '#datatable',
        columnaAutorizacion: 12,
        fechaInicioSelector: '#start_date',
        fechaFinalSelector: '#end_date',
        botonBuscarSelector: '#dateFilterForm button[type="submit"]',
        paginacionSelector: '.dataTables_paginate',
        lengthSelector: 'select[name="datatable_length"]'
    },
    autorizaciones: {
        loginUrl: 'https://app.ontimecar.com.co/Home/',
        targetUrl: 'https://app.ontimecar.com.co/Autorizaciones',
        username: process.env.ONTIMECAR_USERNAME,
        password: process.env.ONTIMECAR_PASSWORD,
        tableSelector: '#grdAutorizaciones',
        fechaInicioSelector: '#txtFechaInicio',
        fechaFinalSelector: '#txtFechaFinal',
        botonBuscarSelector: '#btnBuscar',
        paginacionSelector: '.pagination',
    }
};

// ============================================
// GESTIÓN DE NAVEGADOR
// ============================================
let browser = null;
let activeSessions = 0;
const MAX_CONCURRENT = 3;

async function getBrowser() {
    if (!browser) {
        console.log('Iniciando navegador...');
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

function formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    if (format === 'DD/MM/YYYY') {
        return `${day}/${month}/${year}`;
    }
    return `${year}-${month}-${day}`;
}

function getDateRange(daysBack = CONFIG.defaultDaysBack) {
    const fechaFinal = new Date();
    const fechaInicio = new Date();
    fechaInicio.setDate(fechaInicio.getDate() - daysBack);
    
    return {
        inicio: fechaInicio,
        final: fechaFinal
    };
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

        await page.waitForSelector('input[name="username"]', { 
            timeout: CONFIG.selectorTimeout,
            visible: true 
        });
        
        await sleep(500);

        await page.evaluate(() => {
            document.querySelector('input[name="username"]').value = '';
            document.querySelector('input[name="password"]').value = '';
        });

        await page.type('input[name="username"]', config.username, { delay: 50 });
        await page.type('input[name="password"]', config.password, { delay: 50 });

        console.log('Credenciales ingresadas, enviando...');

        const navigationPromise = page.waitForNavigation({ 
            waitUntil: 'networkidle2',
            timeout: 15000 
        }).catch(() => null);

        await page.click('button[type="submit"]');
        await navigationPromise;
        
        await sleep(2000);

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

        console.log('Login exitoso');
        return true;

    } catch (error) {
        console.error(`Error en login (intento ${attempt}):`, error.message);
        
        if (attempt < CONFIG.retryAttempts) {
            console.log('Reintentando en 3 segundos...');
            await sleep(3000);
            return loginToOnTimeCar(page, config, attempt + 1);
        }
        
        throw new Error(`Login fallido después de ${CONFIG.retryAttempts} intentos: ${error.message}`);
    }
}

// ============================================
// APLICAR FILTRO DE FECHAS
// ============================================
async function aplicarFiltroDeFechas(page, config, fechaInicio, fechaFinal, dateFormat = 'YYYY-MM-DD') {
    try {
        console.log(`Aplicando filtro de fechas: ${formatDate(fechaInicio, dateFormat)} - ${formatDate(fechaFinal, dateFormat)}`);
        
        await page.waitForSelector(config.fechaInicioSelector, { 
            timeout: CONFIG.selectorTimeout,
            visible: true 
        });
        
        await page.evaluate((selector) => {
            const input = document.querySelector(selector);
            if (input) input.value = '';
        }, config.fechaInicioSelector);
        
        await page.click(config.fechaInicioSelector, { clickCount: 3 });
        await page.type(config.fechaInicioSelector, formatDate(fechaInicio, dateFormat), { delay: 50 });
        
        await page.evaluate((selector) => {
            const input = document.querySelector(selector);
            if (input) input.value = '';
        }, config.fechaFinalSelector);
        
        await page.click(config.fechaFinalSelector, { clickCount: 3 });
        await page.type(config.fechaFinalSelector, formatDate(fechaFinal, dateFormat), { delay: 50 });
        
        await sleep(500);
        
        if (config.lengthSelector) {
            console.log('Configurando para mostrar 100 registros por página...');
            await page.waitForSelector(config.lengthSelector, { timeout: 5000 }).catch(() => {});
            await page.select(config.lengthSelector, '100').catch(() => {
                console.log('No se pudo cambiar el número de registros por página');
            });
            await sleep(1000);
        }
        
        console.log('Ejecutando búsqueda...');
        await page.click(config.botonBuscarSelector);
        
        await sleep(CONFIG.waitAfterSearch);
        
        await page.waitForFunction(() => {
            const processing = document.querySelector('.dataTables_processing');
            return !processing || processing.style.display === 'none';
        }, { timeout: 15000 }).catch(() => console.log('Timeout esperando DataTables'));
        
        await sleep(1000);
        
        console.log('Filtro aplicado correctamente');
        return true;
        
    } catch (error) {
        console.error('Error aplicando filtro de fechas:', error.message);
        throw error;
    }
}

// ============================================
// EXTRAER DATOS DE UNA PÁGINA
// ============================================
async function extraerDatosDePagina(page, config) {
    try {
        await page.waitForSelector(config.tableSelector, { 
            timeout: CONFIG.selectorTimeout 
        });
        
        await page.waitForFunction(() => {
            const processing = document.querySelector('.dataTables_processing');
            return !processing || processing.style.display === 'none';
        }, { timeout: 10000 }).catch(() => {});
        
        const datos = await page.evaluate((selector) => {
            const tabla = document.querySelector(selector);
            if (!tabla) return [];
            
            const tbody = tabla.querySelector('tbody');
            if (!tbody) return [];
            
            const filas = Array.from(tbody.querySelectorAll('tr'));
            
            return filas.map((fila, index) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                const registro = {
                    fila_numero: index + 1,
                    acciones: celdas[0]?.innerText.trim() || '',
                    checkbox: celdas[1]?.querySelector('input[type="checkbox"]')?.checked || false,
                    sms: celdas[2]?.innerText.trim() || '',
                    fecha_cita: celdas[3]?.querySelector('input')?.value || celdas[3]?.innerText.trim() || '',
                    identificacion_usuario: celdas[4]?.innerText.trim() || '',
                    nombre_usuario: celdas[5]?.innerText.trim() || '',
                    telefono_usuario: celdas[6]?.querySelector('input')?.value || celdas[6]?.innerText.trim() || '',
                    zona: celdas[7]?.querySelector('input')?.value || celdas[7]?.innerText.trim() || '',
                    ciudad_origen: celdas[8]?.innerText.trim() || '',
                    direccion_origen: celdas[9]?.querySelector('input')?.value || celdas[9]?.innerText.trim() || '',
                    ciudad_destino: celdas[10]?.innerText.trim() || '',
                    ips_destino: celdas[11]?.querySelector('input')?.value || celdas[11]?.innerText.trim() || '',
                    numero_autorizacion: celdas[12]?.innerText.trim() || '',
                    cantidad_servicios: celdas[13]?.innerText.trim() || '',
                    fecha_vigencia: celdas[14]?.innerText.trim() || '',
                    hora_recogida: celdas[15]?.querySelector('input')?.value || celdas[15]?.innerText.trim() || '',
                    hora_retorno: celdas[16]?.querySelector('input')?.value || celdas[16]?.innerText.trim() || '',
                    nombre_acompanante: celdas[17]?.querySelector('input')?.value || celdas[17]?.innerText.trim() || '',
                    identificacion_acompanante: celdas[18]?.querySelector('input')?.value || celdas[18]?.innerText.trim() || '',
                    parentesco: celdas[19]?.querySelector('input')?.value || celdas[19]?.innerText.trim() || '',
                    telefono_acompanante: celdas[20]?.querySelector('input')?.value || celdas[20]?.innerText.trim() || '',
                    conductor: celdas[21]?.querySelector('select')?.value || celdas[21]?.innerText.trim() || '',
                    celular_conductor: celdas[22]?.innerText.trim() || '',
                    observaciones: celdas[23]?.querySelector('input')?.value || celdas[23]?.innerText.trim() || '',
                    estado: celdas[24]?.innerText.trim() || '',
                    color_fila: window.getComputedStyle(fila).backgroundColor
                };
                
                return registro;
            }).filter(reg => reg.identificacion_usuario);
            
        }, config.tableSelector);
        
        console.log(`Extraidos ${datos.length} registros de la página actual`);
        return datos;
        
    } catch (error) {
        console.error('Error extrayendo datos:', error.message);
        return [];
    }
}

// ============================================
// MANEJAR PAGINACIÓN
// ============================================
async function obtenerTodosPaginados(page, config) {
    const todosLosDatos = [];
    let paginaActual = 1;
    let hayMasPaginas = true;
    
    while (hayMasPaginas) {
        console.log(`\nProcesando página ${paginaActual}...`);
        
        const datosPagina = await extraerDatosDePagina(page, config);
        todosLosDatos.push(...datosPagina);
        
        const infoPaginacion = await page.evaluate(() => {
            const infoElement = document.querySelector('.dataTables_info');
            const info = infoElement ? infoElement.innerText : '';
            
            const match = info.match(/(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/i);
            
            if (match) {
                return {
                    desde: parseInt(match[1]),
                    hasta: parseInt(match[2]),
                    total: parseInt(match[3]),
                    hayMas: parseInt(match[2]) < parseInt(match[3])
                };
            }
            
            return null;
        });
        
        if (infoPaginacion) {
            console.log(`Mostrando ${infoPaginacion.desde}-${infoPaginacion.hasta} de ${infoPaginacion.total} registros totales`);
            hayMasPaginas = infoPaginacion.hayMas;
        } else {
            hayMasPaginas = await page.evaluate((selector) => {
                const paginacion = document.querySelector(selector);
                if (!paginacion) return false;
                
                const btnNext = paginacion.querySelector('.paginate_button.next:not(.disabled)');
                return btnNext !== null;
            }, config.paginacionSelector);
        }
        
        if (hayMasPaginas) {
            console.log('Navegando a siguiente página...');
            
            const clickSuccess = await page.evaluate((selector) => {
                const paginacion = document.querySelector(selector);
                if (!paginacion) return false;
                
                const btnNext = paginacion.querySelector('.paginate_button.next:not(.disabled)');
                if (btnNext) {
                    btnNext.click();
                    return true;
                }
                return false;
            }, config.paginacionSelector);
            
            if (!clickSuccess) {
                console.log('No se pudo hacer click en siguiente página');
                break;
            }
            
            await sleep(CONFIG.waitAfterPagination);
            
            await page.waitForFunction(() => {
                const processing = document.querySelector('.dataTables_processing');
                return !processing || processing.style.display === 'none';
            }, { timeout: 10000 }).catch(() => {});
            
            await sleep(500);
            
            paginaActual++;
            
            if (paginaActual > 200) {
                console.log('Alcanzado límite de 200 páginas, deteniendo...');
                break;
            }
        }
    }
    
    console.log(`\nTotal de registros extraídos: ${todosLosDatos.length}`);
    return todosLosDatos;
}

// ============================================
// SCRAPING COMPLETO POR FECHAS - AGENDAMIENTOS
// ============================================
async function scrapAgendamientosPorFechas(fechaInicio, fechaFinal, dateFormat = 'YYYY-MM-DD') {
    const startTime = Date.now();
    let page = null;
    
    try {
        activeSessions++;
        
        if (activeSessions > MAX_CONCURRENT) {
            throw new Error(`Límite de sesiones concurrentes alcanzado (${MAX_CONCURRENT})`);
        }
        
        const config = ONTIMECAR_CONFIGS.agendamientos;
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setDefaultTimeout(CONFIG.maxTimeout);
        
        await loginToOnTimeCar(page, config);
        
        console.log('Navegando a agendamientos...');
        await page.goto(config.targetUrl, { 
            waitUntil: 'networkidle2',
            timeout: CONFIG.navigationTimeout 
        });
        
        await sleep(3000);
        
        await aplicarFiltroDeFechas(page, config, fechaInicio, fechaFinal, dateFormat);
        
        const todosLosDatos = await obtenerTodosPaginados(page, config);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        return {
            success: true,
            data: todosLosDatos,
            metadata: {
                totalRegistros: todosLosDatos.length,
                fechaInicio: formatDate(fechaInicio, dateFormat),
                fechaFinal: formatDate(fechaFinal, dateFormat),
                duracionSegundos: parseFloat(duration),
                timestamp: new Date().toISOString(),
                tipo: 'agendamientos'
            }
        };
        
    } catch (error) {
        console.error('Error en scraping de agendamientos:', error);
        return {
            success: false,
            error: error.message,
            data: [],
            metadata: {
                tipo: 'agendamientos'
            }
        };
    } finally {
        if (page) {
            await page.close().catch(() => {});
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

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: 'v6.0',
        browser_initialized: browser !== null,
        active_sessions: activeSessions,
        max_concurrent: MAX_CONCURRENT
    });
});

app.post('/consulta/agendamientos-fechas', async (req, res) => {
    try {
        const { 
            fechaInicio, 
            fechaFinal, 
            diasAtras,
            dateFormat = 'YYYY-MM-DD' 
        } = req.body;
        
        let inicio, final;
        
        if (diasAtras) {
            const rango = getDateRange(parseInt(diasAtras));
            inicio = rango.inicio;
            final = rango.final;
        } else if (fechaInicio && fechaFinal) {
            inicio = new Date(fechaInicio);
            final = new Date(fechaFinal);
        } else {
            const rango = getDateRange();
            inicio = rango.inicio;
            final = rango.final;
        }
        
        console.log(`\nNueva solicitud de agendamientos`);
        console.log(`Rango: ${inicio.toLocaleDateString()} - ${final.toLocaleDateString()}`);
        
        const resultado = await scrapAgendamientosPorFechas(inicio, final, dateFormat);
        
        res.json(resultado);
        
    } catch (error) {
        console.error('Error en endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/consulta/agendamientos-mes', async (req, res) => {
    try {
        const rango = getDateRange(30);
        const resultado = await scrapAgendamientosPorFechas(rango.inicio, rango.final);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/consulta/agendamientos-hoy', async (req, res) => {
    try {
        const hoy = new Date();
        const resultado = await scrapAgendamientosPorFechas(hoy, hoy);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/admin/stats', (req, res) => {
    res.json({
        browser_initialized: browser !== null,
        active_sessions: activeSessions,
        max_concurrent: MAX_CONCURRENT,
        uptime_seconds: process.uptime(),
        memory_usage: process.memoryUsage()
    });
});

const server = app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Servidor OnTimeCar Scraper v6.0`);
    console.log(`Puerto: ${PORT}`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`${'='.repeat(50)}\n`);
    console.log(`Endpoints disponibles:`);
    console.log(`  POST /consulta/agendamientos-fechas`);
    console.log(`  GET  /consulta/agendamientos-mes`);
    console.log(`  GET  /consulta/agendamientos-hoy`);
    console.log(`  GET  /health`);
    console.log(`  GET  /admin/stats`);
    console.log(`${'='.repeat(50)}\n`);
});

async function gracefulShutdown(signal) {
    console.log(`\n${signal} recibido, cerrando servidor...`);
    server.close(async () => {
        await closeBrowser();
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
