const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Credenciales de OnTimeCar
const ONTIMECAR_CONFIG = {
    loginUrl: 'https://app.ontimecar.co/app/home/',
    username: 'ANDRES',
    password: 'IAResponsable',
    agendamientoUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
    // Columna de identificación del usuario (según el HTML es la 5ta columna)
    COLUMNA_IDENTIFICACION: 4
};

app.use(express.json());

// Endpoint para consultar por cédula
app.get('/consulta/agendamiento', async (req, res) => {
    const cedula = req.query.cedula;
    
    if (!cedula) {
        return res.status(400).json({ error: 'Parámetro cedula requerido' });
    }

    let browser;
    try {
        console.log(`Buscando información para cédula: ${cedula}`);
        
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // 1. Login
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { waitUntil: 'networkidle2' });
        
        // Esperar y llenar formulario de login (ajusta los selectores según el HTML real)
        await page.waitForSelector('input[name="username"]', { timeout: 5000 });
        await page.type('input[name="username"]', ONTIMECAR_CONFIG.username);
        await page.type('input[name="password"]', ONTIMECAR_CONFIG.password);
        
        // Hacer click en submit
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // 2. Ir a la página de agendamientos
        await page.goto(ONTIMECAR_CONFIG.agendamientoUrl, { waitUntil: 'networkidle2' });
        
        // 3. Esperar que la tabla cargue
        await page.waitForSelector('#datatable', { timeout: 10000 });
        
        // 4. Usar la función de búsqueda de DataTables
        await page.evaluate((cedula) => {
            // Acceder a la instancia de DataTable y buscar
            $('#datatable').DataTable().search(cedula).draw();
        }, cedula);
        
        // Esperar que se actualice la tabla
        await page.waitForTimeout(2000);
        
        // 5. Extraer los datos de la fila que coincide
        const datos = await page.evaluate(() => {
            const rows = document.querySelectorAll('#datatable tbody tr');
            const resultados = [];
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    resultados.push({
                        sms: cells[2]?.innerText.trim(),
                        fecha_cita: cells[3]?.querySelector('input')?.value || cells[3]?.innerText.trim(),
                        identificacion: cells[4]?.innerText.trim(),
                        nombre: cells[5]?.innerText.trim(),
                        telefono: cells[6]?.querySelector('input')?.value || cells[6]?.innerText.trim(),
                        zona: cells[7]?.querySelector('input')?.value || cells[7]?.innerText.trim(),
                        ciudad_origen: cells[8]?.innerText.trim(),
                        direccion_origen: cells[9]?.querySelector('input')?.value || cells[9]?.innerText.trim(),
                        ciudad_destino: cells[10]?.innerText.trim(),
                        ips_destino: cells[11]?.querySelector('input')?.value || cells[11]?.innerText.trim(),
                        numero_autorizacion: cells[12]?.innerText.trim(),
                        cantidad_servicios: cells[13]?.innerText.trim(),
                        fecha_vigencia: cells[14]?.innerText.trim(),
                        hora_recogida: cells[15]?.querySelector('input')?.value || cells[15]?.innerText.trim(),
                        hora_retorno: cells[16]?.querySelector('input')?.value || cells[16]?.innerText.trim(),
                        nombre_acompañante: cells[17]?.querySelector('input')?.value || cells[17]?.innerText.trim(),
                        identificacion_acompañante: cells[18]?.querySelector('input')?.value || cells[18]?.innerText.trim(),
                        parentesco: cells[19]?.querySelector('input')?.value || cells[19]?.innerText.trim(),
                        telefono_acompañante: cells[20]?.querySelector('input')?.value || cells[20]?.innerText.trim(),
                        conductor: cells[21]?.innerText.trim(),
                        celular_conductor: cells[22]?.innerText.trim(),
                        observaciones: cells[23]?.querySelector('input')?.value || cells[23]?.innerText.trim(),
                        estado: cells[24]?.innerText.trim()
                    });
                }
            });
            
            return resultados;
        });

        await browser.close();
        
        if (datos.length === 0) {
            return res.status(404).json({ 
                error: 'No se encontraron registros para esta cédula',
                cedula: cedula 
            });
        }
        
        res.json({
            cedula: cedula,
            registros_encontrados: datos.length,
            datos: datos
        });

    } catch (error) {
        console.error('Error en el scraper:', error);
        if (browser) await browser.close();
        res.status(500).json({ 
            error: 'Error al extraer datos', 
            detalle: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/consulta/agendamiento?cedula=NUMERO_CEDULA`);
});
