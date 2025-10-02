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
                '--disable-software-rasterizer'
            ]
        });

        const page = await browser.newPage();
        await page.setDefaultTimeout(90000);
        await page.setViewport({ width: 1920, height: 1080 });
        
        page.on('console', msg => console.log('Browser:', msg.text()));
        page.on('pageerror', error => console.log('Browser error:', error.message));
        
        console.log('Iniciando sesion...');
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: 45000 
        });
        
        await page.waitForSelector('input[name="username"]', { timeout: 15000 });
        await page.type('input[name="username"]', ONTIMECAR_CONFIG.username);
        await page.type('input[name="password"]', ONTIMECAR_CONFIG.password);
        
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 })
        ]);

        const loginSuccess = await page.evaluate(() => {
            return !document.querySelector('input[name="username"]');
        });

        if (!loginSuccess) {
            throw new Error('Login fallido - verificar credenciales');
        }

        console.log('Login exitoso');

        console.log('Navegando a agendamientos...');
        await page.goto(ONTIMECAR_CONFIG.agendamientoUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 45000 
        });
        
        await page.waitForTimeout(3000);
        
        console.log('Esperando tabla DataTable...');
        
        const tableSelector = await page.evaluate(() => {
            if (document.querySelector('#datatable')) return '#datatable';
            if (document.querySelector('table.dataTable')) return 'table.dataTable';
            if (document.querySelector('.dataTables_wrapper table')) return '.dataTables_wrapper table';
            return null;
        });
        
        if (!tableSelector) {
            await page.screenshot({ path: '/tmp/error-page.png', fullPage: true });
            throw new Error('No se encontro la tabla de agendamientos');
        }
        
        await page.waitForSelector(tableSelector, { timeout: 30000 });
        
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined' && $('#datatable').length > 0;
        }, { timeout: 20000 });
        
        const isDataTableReady = await page.evaluate(() => {
            try {
                return $('#datatable').DataTable() !== undefined;
            } catch (e) {
                return false;
            }
        });
        
        if (!isDataTableReady) {
            await page.waitForTimeout(5000);
        }
        
        console.log(`Filtrando por autorizacion: ${numeroAutorizacion}`);
        
        await page.evaluate((numAuth, columnaIndex) => {
            const table = $('#datatable').DataTable();
            table.column(columnaIndex).search(numAuth).draw();
        }, numeroAutorizacion, ONTIMECAR_CONFIG.COLUMNA_NUMERO_AUTORIZACION);
        
        await page.waitForFunction(() => {
            const processingDiv = document.querySelector('.dataTables_processing');
            return !processingDiv || processingDiv.style.display === 'none';
        }, { timeout: 30000 });
        
        await page.waitForTimeout(2000);
        
        await page.evaluate(() => {
            const table = $('#datatable').DataTable();
            table.page.len(-1).draw();
        });
        
        await page.waitForFunction(() => {
            const processingDiv = document.querySelector('.dataTables_processing');
            return !processingDiv || processingDiv.style.display === 'none';
        }, { timeout: 45000 });
        
        await page.waitForTimeout(3000);
        
        console.log('Extrayendo datos de la tabla...');
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
        
        console.log(`Encontrados ${datos.length} registros`);
        
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
║           OnTimeCar Scraper v2.0 - ACTIVO                  ║
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
