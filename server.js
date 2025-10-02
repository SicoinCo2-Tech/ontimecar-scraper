const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración para ambas plataformas
const ONTIMECAR_CONFIGS = {
    // Plataforma original (.co) - Agendamientos
    agendamientos: {
        loginUrl: 'https://app.ontimecar.co/app/home/',
        targetUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
        username: process.env.ONTIMECAR_USERNAME || 'ANDRES',
        password: process.env.ONTIMECAR_PASSWORD || 'IAResponsable',
        tableSelector: '#datatable',
        columnaAutorizacion: 12
    },
    // Nueva plataforma (.com.co) - Autorizaciones
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

// Función compartida para login
async function loginToOnTimeCar(page, config) {
    console.log('Paso 1: Navegando al login...');
    await page.goto(config.loginUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
    });
    
    console.log('Paso 2: Esperando formulario de login...');
    await page.waitForSelector('input[name="username"]', { timeout: 30000 });
    
    await page.type('input[name="username"]', config.username, { delay: 50 });
    await page.type('input[name="password"]', config.password, { delay: 50 });
    
    console.log('Paso 3: Enviando credenciales...');
    await page.click('button[type="submit"]');
    
    try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
        await page.waitForTimeout(5000);
    }

    const loginSuccess = await page.evaluate(() => {
        return !document.querySelector('input[name="username"]');
    });

    if (!loginSuccess) {
        throw new Error('Login fallido');
    }

    console.log('Paso 4: Login exitoso');
}

// Función para lanzar navegador
async function launchBrowser() {
    return await puppeteer.launch({
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
}

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Dual Scraper v3.0',
        endpoints: {
            agendamientos: '/consulta/agendamiento?numero_autorizacion=NUMERO',
            autorizaciones: '/consulta/autorizacion?numero=NUMERO'
        }
    });
});

// ============================================
// ENDPOINT 1: Agendamientos (ontimecar.co)
// ============================================
app.get('/consulta/agendamiento', async (req, res) => {
    const numeroAutorizacion = req.query.numero_autorizacion || req.query.autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parametro "numero_autorizacion" requerido',
            ejemplo: '/consulta/agendamiento?numero_autorizacion=282664703',
            timestamp: new Date().toISOString()
        });
    }

    let browser;
    try {
        console.log(`[${new Date().toISOString()}] [AGENDAMIENTOS] Buscando: ${numeroAutorizacion}`);
        
        const config = ONTIMECAR_CONFIGS.agendamientos;
        browser = await launchBrowser();
        const page = await browser.newPage();
        await page.setDefaultTimeout(120000);
        await page.setViewport({ width: 1920, height: 1080 });
        
        page.on('console', msg => console.log('Browser:', msg.text()));
        page.on('pageerror', error => console.log('Browser error:', error.message));
        
        // Login
        await loginToOnTimeCar(page, config);

        // Navegar a agendamientos
        console.log('Paso 5: Navegando a agendamientos...');
        await page.goto(config.targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });
        
        await page.waitForTimeout(5000);
        
        console.log('Paso 6: Esperando tabla...');
        await page.waitForSelector(config.tableSelector, { timeout: 60000 });
        
        console.log('Paso 7: Esperando DataTable...');
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined';
        }, { timeout: 30000 });
        
        await page.waitForTimeout(5000);
        
        await page.waitForFunction(() => {
            try {
                return $('#datatable').DataTable() !== undefined;
            } catch (e) {
                return false;
            }
        }, { timeout: 30000 });
        
        console.log(`Paso 8: Buscando: ${numeroAutorizacion}`);
        
        await page.evaluate((numAuth) => {
            const table = $('#datatable').DataTable();
            table.search(numAuth).draw();
        }, numeroAutorizacion);
        
        await page.waitForTimeout(5000);
        
        console.log('Paso 9: Mostrando todos los resultados...');
        await page.evaluate(() => {
            const table = $('#datatable').DataTable();
            table.page.len(-1).draw();
        });
        
        await page.waitForTimeout(8000);
        
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
                error: 'No se encontraron registros',
                numero_autorizacion: numeroAutorizacion,
                plataforma: 'agendamientos (ontimecar.co)',
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            plataforma: 'agendamientos (ontimecar.co)',
            numero_autorizacion: numeroAutorizacion,
            registros_encontrados: datos.length,
            datos: datos,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[AGENDAMIENTOS] Error: ${error.message}`);
        
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
        }
        
        res.status(500).json({ 
            error: 'Error al extraer datos', 
            plataforma: 'agendamientos (ontimecar.co)',
            detalle: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// ENDPOINT 2: Autorizaciones (ontimecar.com.co)
// ============================================
app.get('/consulta/autorizacion', async (req, res) => {
    const numeroAutorizacion = req.query.numero || req.query.numero_autorizacion;
    
    if (!numeroAutorizacion) {
        return res.status(400).json({ 
            error: 'Parametro "numero" requerido',
            ejemplo: '/consulta/autorizacion?numero=282482633',
            timestamp: new Date().toISOString()
        });
    }

    let browser;
    try {
        console.log(`[${new Date().toISOString()}] [AUTORIZACIONES] Buscando: ${numeroAutorizacion}`);
        
        const config = ONTIMECAR_CONFIGS.autorizaciones;
        browser = await launchBrowser();
        const page = await browser.newPage();
        await page.setDefaultTimeout(120000);
        await page.setViewport({ width: 1920, height: 1080 });
        
        page.on('console', msg => console.log('Browser:', msg.text()));
        page.on('pageerror', error => console.log('Browser error:', error.message));
        
        // Login
        await loginToOnTimeCar(page, config);

        // Navegar a autorizaciones
        console.log('Paso 5: Navegando a autorizaciones...');
        await page.goto(config.targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });
        
        await page.waitForTimeout(5000);
        
        console.log('Paso 6: Esperando Kendo Grid...');
        await page.waitForSelector(config.tableSelector, { timeout: 60000 });
        
        // Esperar a que jQuery y Kendo estén listos
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined' && typeof kendo !== 'undefined';
        }, { timeout: 30000 });
        
        await page.waitForTimeout(5000);
        
        // Verificar que el grid esté inicializado
        await page.waitForFunction(() => {
            try {
                const grid = $('#grdAutorizaciones').data('kendoGrid');
                return grid !== undefined;
            } catch (e) {
                return false;
            }
        }, { timeout: 30000 });
        
        console.log(`Paso 7: Buscando en el filtro: ${numeroAutorizacion}`);
        
        // Usar el campo de filtro específico
        await page.evaluate((numero, selector) => {
            const input = document.querySelector(selector);
            if (input) {
                input.value = numero;
                const event = new Event('input', { bubbles: true });
                input.dispatchEvent(event);
            }
        }, numeroAutorizacion, config.searchInputSelector);
        
        await page.waitForTimeout(3000);
        
        // Forzar búsqueda en el grid
        await page.evaluate((numero) => {
            try {
                const grid = $('#grdAutorizaciones').data('kendoGrid');
                if (grid && grid.dataSource) {
                    grid.dataSource.filter({
                        logic: 'or',
                        filters: [
                            { field: 'Numero', operator: 'contains', value: numero }
                        ]
                    });
                }
            } catch (e) {
                console.log('Error al filtrar:', e);
            }
        }, numeroAutorizacion);
        
        await page.waitForTimeout(5000);
        
        console.log('Paso 8: Extrayendo datos...');
        
        const datos = await page.evaluate((numBuscado) => {
            const resultados = [];
            
            try {
                // Intentar obtener datos desde el DataSource de Kendo
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
                
                // Si no hay resultados desde el DataSource, intentar desde el DOM
                if (resultados.length === 0) {
                    const rows = document.querySelectorAll('#grdAutorizaciones tbody tr');
                    
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        
                        if (cells.length > 5 && !row.classList.contains('k-no-data')) {
                            const numero = cells[0]?.innerText.trim() || '';
                            
                            if (numero.includes(numBuscado)) {
                                resultados.push({
                                    numero: cells[0]?.innerText.trim() || '',
                                    prescripcion: cells[1]?.innerText.trim() || '',
                                    paciente: cells[2]?.innerText.trim() || '',
                                    fecha_creacion: cells[3]?.innerText.trim() || '',
                                    fecha_final_atencion: cells[4]?.innerText.trim() || '',
                                    estado_autorizacion: cells[5]?.innerText.trim() || '',
                                    estado_facturacion: cells[6]?.innerText.trim() || '',
                                    cantidad: cells[7]?.innerText.trim() || '',
                                    ruta_origen: cells[8]?.innerText.trim() || '',
                                    ruta_destino: cells[9]?.innerText.trim() || '',
                                    mapiss: cells[10]?.innerText.trim() || '',
                                    nombre_diagnostico: cells[11]?.innerText.trim() || '',
                                    cliente: cells[12]?.innerText.trim() || '',
                                    ips_remitido: cells[13]?.innerText.trim() || '',
                                    estado: cells[14]?.innerText.trim() || ''
                                });
                            }
                        }
                    });
                }
            } catch (e) {
                console.log('Error extrayendo datos:', e);
            }
            
            return resultados;
        }, numeroAutorizacion);

        await browser.close();
        
        console.log(`Encontrados ${datos.length} registros`);
        
        if (datos.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron registros',
                numero: numeroAutorizacion,
                plataforma: 'autorizaciones (ontimecar.com.co)',
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            plataforma: 'autorizaciones (ontimecar.com.co)',
            numero: numeroAutorizacion,
            registros_encontrados: datos.length,
            datos: datos,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[AUTORIZACIONES] Error: ${error.message}`);
        
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
        }
        
        res.status(500).json({ 
            error: 'Error al extraer datos',
            plataforma: 'autorizaciones (ontimecar.com.co)',
            detalle: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Manejador de errores global
app.use((err, req, res, next) => {
    res.status(500).json({ 
        error: 'Error interno del servidor',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║          OnTimeCar Dual Scraper v3.0 - ACTIVO                    ║
╠══════════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  [1] Agendamientos (ontimecar.co):                               ║
║      /consulta/agendamiento?numero_autorizacion=NUM              ║
║                                                                   ║
║  [2] Autorizaciones (ontimecar.com.co):                          ║
║      /consulta/autorizacion?numero=NUM                           ║
╚══════════════════════════════════════════════════════════════════╝
    `);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
