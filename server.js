const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

const ONTIMECAR_CONFIG = {
    loginUrl: 'https://app.ontimecar.co/app/home/',
    username: process.env.ONTIMECAR_USERNAME || 'ANDRES',
    password: process.env.ONTIMECAR_PASSWORD || 'IAResponsable',
    agendamientoUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
    COLUMNA_NUMERO_AUTORIZACION: 12
};

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Scraper v2.0',
        endpoint: '/consulta/agendamiento?numero_autorizacion=NUMERO'
    });
});

app.get('/consulta/agendamiento', async (req, res) => {
    const numeroAutorizacion = req.query.numero_autorizacion || req.query.autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parametro "numero_autorizacion" requerido',
            ejemplo: '/consulta/agendamiento?numero_autorizacion=279953166',
            timestamp: new Date().toISOString()
        });
    }

    let browser;
    try {
        console.log(`[${new Date().toISOString()}] Buscando autorizacion: ${numeroAutorizacion}`);
        
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
                '--disable-software-rasterizer',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();
        await page.setDefaultTimeout(120000); // Aumentado a 2 minutos
        await page.setViewport({ width: 1920, height: 1080 });
        
        page.on('console', msg => console.log('Browser:', msg.text()));
        page.on('pageerror', error => console.log('Browser error:', error.message));
        
        // LOGIN
        console.log('Paso 1: Navegando al login...');
        try {
            await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
        } catch (e) {
            console.log('Error en goto login, reintentando...');
            await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
                waitUntil: 'load',
                timeout: 60000 
            });
        }
        
        console.log('Paso 2: Esperando formulario de login...');
        await page.waitForSelector('input[name="username"]', { timeout: 30000 });
        
        await page.type('input[name="username"]', ONTIMECAR_CONFIG.username, { delay: 50 });
        await page.type('input[name="password"]', ONTIMECAR_CONFIG.password, { delay: 50 });
        
        console.log('Paso 3: Enviando credenciales...');
        await page.click('button[type="submit"]');
        
        // Esperar navegación con múltiples estrategias
        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.log('Navegacion lenta, esperando...');
            await page.waitForTimeout(5000);
        }

        const loginSuccess = await page.evaluate(() => {
            return !document.querySelector('input[name="username"]');
        });

        if (!loginSuccess) {
            throw new Error('Login fallido - verificar credenciales');
        }

        console.log('Paso 4: Login exitoso');

        // NAVEGAR A AGENDAMIENTOS
        console.log('Paso 5: Navegando a agendamientos...');
        try {
            await page.goto(ONTIMECAR_CONFIG.agendamientoUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
        } catch (e) {
            console.log('Error en goto agendamientos, continuando...');
        }
        
        await page.waitForTimeout(5000);
        
        // ESPERAR TABLA
        console.log('Paso 6: Buscando tabla...');
        
        const tableFound = await page.evaluate(() => {
            return document.querySelector('#datatable') !== null;
        });
        
        if (!tableFound) {
            console.log('Tabla no encontrada inmediatamente, esperando mas...');
            await page.waitForTimeout(10000);
        }
        
        await page.waitForSelector('#datatable', { timeout: 60000 });
        
        // ESPERAR JQUERY Y DATATABLE
        console.log('Paso 7: Esperando DataTable...');
        
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined';
        }, { timeout: 30000 });
        
        await page.waitForTimeout(3000);
        
        const dtReady = await page.evaluate(() => {
            try {
                if (typeof $ === 'undefined') return false;
                const dt = $('#datatable').DataTable();
                return dt !== undefined;
            } catch (e) {
                return false;
            }
        });
        
        if (!dtReady) {
            console.log('DataTable no inicializado, esperando 10s mas...');
            await page.waitForTimeout(10000);
        }
        
        // BUSCAR
        console.log(`Paso 8: Buscando autorizacion ${numeroAutorizacion}...`);
        
        await page.evaluate((numAuth, colIndex) => {
            try {
                const table = $('#datatable').DataTable();
                table.column(colIndex).search(numAuth).draw();
            } catch (e) {
                console.log('Error en busqueda:', e);
            }
        }, numeroAutorizacion, ONTIMECAR_CONFIG.COLUMNA_NUMERO_AUTORIZACION);
        
        await page.waitForTimeout(5000);
        
        // MOSTRAR TODOS
        console.log('Paso 9: Mostrando todos los resultados...');
        
        await page.evaluate(() => {
            try {
                const table = $('#datatable').DataTable();
                table.page.len(-1).draw();
            } catch (e) {
                console.log('Error mostrando todos:', e);
            }
        });
        
        await page.waitForTimeout(8000);
        
        // EXTRAER DATOS
        console.log('Paso 10: Extrayendo datos...');
        
        const datos = await page.evaluate((numAuthBuscado) => {
            const rows = document.querySelectorAll('#datatable tbody tr');
            const resultados = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                
                if (cells.length > 10 && !row.classList.contains('dataTables_empty')) {
                    const numAutorizacionFila = cells[12]?.innerText.trim() || '';
                    
                    if (numAutorizacionFila !== numAuthBuscado) {
                        return;
                    }
                    
                    const getValue = (cell) => {
                        if (!cell) return '';
                        const input = cell.querySelector('input');
                        if (input) {
                            if (input.type === 'date' || input.name === 'fecha_convertida') {
                                return input.value || input.getAttribute('value') || '';
                            }
                            return input.value || '';
                        }
                        return cell.innerText.trim() || '';
                    };

                    const registro = {
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
                    };
                    
                    resultados.push(registro);
                }
            });
            
            return resultados;
        }, numeroAutorizacion);

        await browser.close();
        
        console.log(`Completado: ${datos.length} registros encontrados`);
        
        if (datos.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron registros para este numero de autorizacion',
                numero_autorizacion: numeroAutorizacion,
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            numero_autorizacion: numeroAutorizacion,
            registros_encontrados: datos.length,
            datos: datos,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error:`, error.message);
        console.error('Stack:', error.stack);
        
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.error('Error cerrando browser:', closeError.message);
            }
        }
        
        res.status(500).json({ 
            error: 'Error al extraer datos', 
            detalle: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({ 
        error: 'Error interno del servidor',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           OnTimeCar Scraper v2.1 - ACTIVO                  ║
╠════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                            ║
║  Health: /health                                           ║
║  Consulta: /consulta/agendamiento?numero_autorizacion=NUM  ║
║  Usuario: ${ONTIMECAR_CONFIG.username}                     ║
║  Timestamp: ${new Date().toISOString()}                    ║
╚════════════════════════════════════════════════════════════╝
    `);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM recibido, cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT recibido, cerrando servidor...');
    process.exit(0);
});
