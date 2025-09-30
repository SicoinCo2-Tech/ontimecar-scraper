const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Credenciales desde variables de entorno
const ONTIMECAR_CONFIG = {
    loginUrl: 'https://app.ontimecar.co/app/home/',
    username: process.env.ONTIMECAR_USERNAME || 'ANDRES',
    password: process.env.ONTIMECAR_PASSWORD || 'IAResponsable',
    agendamientoUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
    COLUMNA_IDENTIFICACION: 4
};

app.use(express.json());

// Endpoint de health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Scraper'
    });
});

// Endpoint principal para consultar por cédula
app.get('/consulta/agendamiento', async (req, res) => {
    const cedula = req.query.cedula;
    
    if (!cedula) {
        return res.status(400).json({ 
            error: 'Parámetro cedula requerido',
            ejemplo: '/consulta/agendamiento?cedula=123456789'
        });
    }

    let browser;
    try {
        console.log(`[${new Date().toISOString()}] Buscando información para cédula: ${cedula}`);
        
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
                '--disable-extensions'
            ]
        });

        const page = await browser.newPage();
        await page.setDefaultTimeout(30000);
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('Navegando a página de login...');
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Esperar y llenar formulario de login
        console.log('Esperando formulario de login...');
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        
        await page.type('input[name="username"]', ONTIMECAR_CONFIG.username);
        await page.type('input[name="password"]', ONTIMECAR_CONFIG.password);
        
        console.log('Iniciando sesión...');
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);

        // Verificar si el login fue exitoso
        const loginSuccess = await page.evaluate(() => {
            return !document.querySelector('input[name="username"]');
        });

        if (!loginSuccess) {
            throw new Error('Login fallido - verificar credenciales');
        }

        console.log('Login exitoso, navegando a agendamientos...');
        await page.goto(ONTIMECAR_CONFIG.agendamientoUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Esperar que la tabla cargue
        console.log('Esperando que cargue la tabla...');
        await page.waitForSelector('#datatable', { timeout: 15000 });
        
        // Esperar que jQuery y DataTables estén disponibles
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined' && $('#datatable').DataTable;
        }, { timeout: 10000 });
        
        console.log(`Buscando cédula: ${cedula}`);
        // Usar la función de búsqueda de DataTables
        await page.evaluate((cedula) => {
            $('#datatable').DataTable().search(cedula).draw();
        }, cedula);
        
        // Esperar que se actualice la tabla
        await page.waitForTimeout(3000);
        
        // Extraer los datos de las filas que coinciden
        console.log('Extrayendo datos...');
        const datos = await page.evaluate(() => {
            const rows = document.querySelectorAll('#datatable tbody tr');
            const resultados = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                
                // Verificar que no sea la fila de "No hay datos"
                if (cells.length > 1 && !row.classList.contains('dataTables_empty')) {
                    const registro = {
                        sms: cells[2]?.innerText.trim() || '',
                        fecha_cita: cells[3]?.querySelector('input')?.value || cells[3]?.innerText.trim() || '',
                        identificacion: cells[4]?.innerText.trim() || '',
                        nombre: cells[5]?.innerText.trim() || '',
                        telefono: cells[6]?.querySelector('input')?.value || cells[6]?.innerText.trim() || '',
                        zona: cells[7]?.querySelector('input')?.value || cells[7]?.innerText.trim() || '',
                        ciudad_origen: cells[8]?.innerText.trim() || '',
                        direccion_origen: cells[9]?.querySelector('input')?.value || cells[9]?.innerText.trim() || '',
                        ciudad_destino: cells[10]?.innerText.trim() || '',
                        ips_destino: cells[11]?.querySelector('input')?.value || cells[11]?.innerText.trim() || '',
                        numero_autorizacion: cells[12]?.innerText.trim() || '',
                        cantidad_servicios: cells[13]?.innerText.trim() || '',
                        fecha_vigencia: cells[14]?.innerText.trim() || '',
                        hora_recogida: cells[15]?.querySelector('input')?.value || cells[15]?.innerText.trim() || '',
                        hora_retorno: cells[16]?.querySelector('input')?.value || cells[16]?.innerText.trim() || '',
                        nombre_acompanante: cells[17]?.querySelector('input')?.value || cells[17]?.innerText.trim() || '',
                        identificacion_acompanante: cells[18]?.querySelector('input')?.value || cells[18]?.innerText.trim() || '',
                        parentesco: cells[19]?.querySelector('input')?.value || cells[19]?.innerText.trim() || '',
                        telefono_acompanante: cells[20]?.querySelector('input')?.value || cells[20]?.innerText.trim() || '',
                        conductor: cells[21]?.innerText.trim() || '',
                        celular_conductor: cells[22]?.innerText.trim() || '',
                        observaciones: cells[23]?.querySelector('input')?.value || cells[23]?.innerText.trim() || '',
                        estado: cells[24]?.innerText.trim() || ''
                    };
                    
                    resultados.push(registro);
                }
            });
            
            return resultados;
        });

        await browser.close();
        
        console.log(`Encontrados ${datos.length} registros`);
        
        if (datos.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron registros para esta cédula',
                cedula: cedula,
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({
            success: true,
            cedula: cedula,
            registros_encontrados: datos.length,
            datos: datos,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error en el scraper:`, error.message);
        if (browser) {
            await browser.close();
        }
        res.status(500).json({ 
            error: 'Error al extraer datos', 
            detalle: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Manejo de errores global
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
║           OnTimeCar Scraper - INICIADO                     ║
╠════════════════════════════════════════════════════════════╣
║  Puerto: ${PORT}                                            ║
║  Endpoint: /consulta/agendamiento?cedula=NUMERO            ║
║  Health Check: /health                                     ║
║  Timestamp: ${new Date().toISOString()}                    ║
╚════════════════════════════════════════════════════════════╝
    `);
});

// Manejo de cierre graceful
process.on('SIGTERM', () => {
    console.log('SIGTERM recibido, cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT recibido, cerrando servidor...');
    process.exit(0);
});
