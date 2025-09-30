const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

const ONTIMECAR_CONFIG = {
    loginUrl: 'https://app.ontimecar.co/app/home/',
    username: process.env.ONTIMECAR_USERNAME || 'ANDRES',
    password: process.env.ONTIMECAR_PASSWORD || 'IAResponsable',
    agendamientoUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
    COLUMNA_IDENTIFICACION: 4 // Índice de la columna de identificación (columna 5 en la vista)
};

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'OnTimeCar Scraper'
    });
});

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
        
        console.log('Esperando formulario de login...');
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        
        await page.type('input[name="username"]', ONTIMECAR_CONFIG.username);
        await page.type('input[name="password"]', ONTIMECAR_CONFIG.password);
        
        console.log('Iniciando sesión...');
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);

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
        
        console.log('Esperando que cargue la tabla...');
        await page.waitForSelector('#datatable', { timeout: 15000 });
        
        await page.waitForFunction(() => {
            return typeof $ !== 'undefined' && $('#datatable').DataTable;
        }, { timeout: 10000 });
        
        console.log(`Buscando cédula: ${cedula} en la columna de identificación`);
        
        // Cambiar el pageLength a -1 para mostrar TODOS los registros
        await page.evaluate((cedula, columnaIndex) => {
            const table = $('#datatable').DataTable();
            // Mostrar todos los registros (sin paginación)
            table.page.len(-1).draw();
            // Búsqueda específica en la columna de identificación
            table.column(columnaIndex).search(cedula).draw();
        }, cedula, ONTIMECAR_CONFIG.COLUMNA_IDENTIFICACION);
        
        // Esperar a que la tabla termine de actualizar
        await page.waitForFunction(() => {
            const processingDiv = document.querySelector('.dataTables_processing');
            return !processingDiv || processingDiv.style.display === 'none';
        }, { timeout: 15000 });
        
        // Esperar un poco más para asegurar que el DOM se actualice completamente
        await page.waitForTimeout(2000);
        
        console.log('Extrayendo datos...');
        const datos = await page.evaluate((columnaIdentificacion) => {
            const rows = document.querySelectorAll('#datatable tbody tr');
            const resultados = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                
                // Verificar que no sea la fila de "No hay datos" y que tenga suficientes columnas
                if (cells.length > 10 && !row.classList.contains('dataTables_empty')) {
                    // Función auxiliar para extraer valor de input o texto
                    const getValue = (cell) => {
                        if (!cell) return '';
                        const input = cell.querySelector('input');
                        if (input) {
                            // Para inputs tipo date, asegurarse de obtener el valor correcto
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
        }, ONTIMECAR_CONFIG.COLUMNA_IDENTIFICACION);

        await browser.close();
        
        console.log(`Encontrados ${datos.length} registros para cédula: ${cedula}`);
        
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
        console.error('Stack trace:', error.stack);
        
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

process.on('SIGTERM', () => {
    console.log('SIGTERM recibido, cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT recibido, cerrando servidor...');
    process.exit(0);
});
