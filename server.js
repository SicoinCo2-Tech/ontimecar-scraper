// server.js - Scraper OnTimeCar para Agendamiento CORREGIDO
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Middleware para logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Credenciales de OnTimeCar
const ONTIMECAR_CONFIG = {
    loginUrl: 'https://app.ontimecar.co/app/home/',
    username: 'ANDRES',
    password: 'IAResponsable',
    agendamientoUrl: 'https://app.ontimecar.co/app/agendamiento/'
};

// Función mejorada para hacer login y scraping de agendamiento
async function consultarAgendamiento(cedula) {
    let browser = null;
    
    try {
        console.log(`[SCRAPER] Iniciando consulta de agendamiento para cédula: ${cedula}`);
        
        // Lanzar navegador
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();
        
        // Configurar timeout más largo
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);
        
        await page.setViewport({ width: 1366, height: 768 });

        // PASO 1: Hacer login
        console.log('[SCRAPER] Navegando a página de login...');
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log('[SCRAPER] Ingresando credenciales...');
        
        // Esperar inputs de login
        await page.waitForSelector('input[type="text"], input[type="password"], input[name="username"], input[name="password"]', { timeout: 15000 });

        // Encontrar inputs
        const usernameInput = await page.$('input[type="text"], input[name="username"]');
        const passwordInput = await page.$('input[type="password"], input[name="password"]');

        if (!usernameInput || !passwordInput) {
            throw new Error('No se pudieron encontrar los campos de login');
        }

        await usernameInput.click({ clickCount: 3 });
        await usernameInput.type(ONTIMECAR_CONFIG.username, { delay: 100 });
        
        await passwordInput.click({ clickCount: 3 });
        await passwordInput.type(ONTIMECAR_CONFIG.password, { delay: 100 });
        
        // Hacer login
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        console.log('[SCRAPER] Login exitoso. Navegando a agendamiento...');

        // PASO 2: Navegar a la página de agendamiento
        await page.goto(ONTIMECAR_CONFIG.agendamientoUrl, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        console.log('[SCRAPER] Página de agendamiento cargada, buscando tabla...');

        // Esperar a que cargue la tabla específica
        await page.waitForSelector('#datatable', { timeout: 10000 });
        console.log('[SCRAPER] Tabla datatable encontrada');

        // PASO 3: Buscar campo de búsqueda y filtrar por cédula
        console.log('[SCRAPER] Buscando campo de búsqueda...');
        
        // Intentar diferentes selectores de búsqueda
        const selectoresBusqueda = [
            'input[type="search"]',
            'input[placeholder*="buscar"]',
            'input[placeholder*="Buscar"]',
            'input[name="search"]',
            '.dataTables_filter input',
            'input[type="text"]'
        ];

        let busquedaRealizada = false;
        
        for (const selector of selectoresBusqueda) {
            try {
                const campoBusqueda = await page.$(selector);
                if (campoBusqueda) {
                    console.log(`[SCRAPER] Encontrado campo con selector: ${selector}`);
                    await campoBusqueda.click({ clickCount: 3 });
                    await campoBusqueda.type(cedula, { delay: 100 });
                    await page.waitForTimeout(3000);
                    busquedaRealizada = true;
                    break;
                }
            } catch (e) {
                // Continuar con siguiente selector
            }
        }

        if (!busquedaRealizada) {
            console.log('[SCRAPER] No se encontró campo de búsqueda, extrayendo todos los datos...');
        }

        // PASO 4: Extraer datos de la tabla específica
        console.log('[SCRAPER] Extrayendo datos de la tabla datatable...');
        
        const servicios = await page.evaluate((cedulaBuscada) => {
            const tabla = document.querySelector('#datatable');
            if (!tabla) {
                console.log('No se encontró la tabla datatable');
                return [];
            }

            // Buscar el tbody
            const tbody = tabla.querySelector('tbody');
            if (!tbody) {
                console.log('No se encontró tbody en la tabla');
                return [];
            }

            const filas = Array.from(tbody.querySelectorAll('tr'));
            console.log(`Encontradas ${filas.length} filas en tbody`);

            const resultados = [];

            filas.forEach((fila, index) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                if (celdas.length > 0) {
                    // Extraer texto de cada celda
                    const datos = celdas.map(celda => {
                        let texto = celda.innerText?.trim() || '';
                        // Limpiar texto
                        texto = texto.replace(/\s+/g, ' ').trim();
                        return texto;
                    });

                    // Unir todos los datos para buscar la cédula
                    const textoCompleto = datos.join(' ').toLowerCase();
                    const cedulaEnMinusculas = cedulaBuscada.toLowerCase();

                    // Solo incluir si contiene la cédula buscada o si no hay búsqueda
                    if (textoCompleto.includes(cedulaEnMinusculas) || !cedulaBuscada) {
                        // Mapear según la estructura de encabezados que vimos
                        const servicio = {
                            fila: index + 1,
                            datosCompletos: datos,
                            datosRaw: datos.join(' | '),
                            // Mapeo basado en los encabezados de la tabla
                            accion: datos[0] || '', // ACCIONES
                            checkbox: datos[1] || '', // Checkbox
                            sms: datos[2] || '', // SMS
                            fechaCita: datos[3] || '', // FECHA DE CITA
                            identificacionUsuario: datos[4] || '', // IDENTIFICATION USUARIO
                            nombreUsuario: datos[5] || '', // NOMBRE USUARIO
                            telefonoUsuario: datos[6] || '', // TELEFONO USUARIO
                            zona: datos[7] || '', // ZONA
                            ciudadOrigen: datos[8] || '', // CIUDAD ORIGEN
                            direccionOrigen: datos[9] || '', // DIRECCION ORIGEN
                            ciudadDestino: datos[10] || '', // CIUDAD DESTINO
                            direccionDestino: datos[11] || '', // DIRECCION DESTINO
                            numeroAutorizacion: datos[12] || '', // NUMERO AUTORIZACION
                            cantidadServicios: datos[13] || '', // CANTIDAD DE SERVICIOS AUTORIZADOS
                            fechaVigencia: datos[14] || '', // FECHA VIGENCIA
                            nombreRegion: datos[15] || '', // NOMBRE REGION
                            nombreRetorno: datos[16] || '', // NOMBRE RETORNO
                            nombreAcompanante: datos[17] || '', // NOMBRE ACOMPAÑANTE
                            identificacionAcompanante: datos[18] || '', // IDENTIFICATION ACOMPAÑANTE
                            parentesco: datos[19] || '', // PARENTESCO
                            telefonoAcompanante: datos[20] || '', // TELEFONO ACOMPAÑANTE
                            conduccion: datos[21] || '', // CONDUCCION
                            clase: datos[22] || '', // CLASE
                            observaciones: datos[23] || '', // OBSERVACIONES
                            estado: datos[24] || '' // ESTADO
                        };

                        resultados.push(servicio);
                    }
                }
            });

            return resultados;
        }, cedula);

        console.log(`[SCRAPER] Se encontraron ${servicios.length} registros para la cédula ${cedula}`);

        // Si no encontramos resultados, intentar una búsqueda más amplia
        if (servicios.length === 0) {
            console.log('[SCRAPER] Intentando búsqueda alternativa...');
            const todosLosDatos = await page.evaluate(() => {
                const todasLasTablas = Array.from(document.querySelectorAll('table, .table'));
                let todosLosResultados = [];

                todasLasTablas.forEach((tabla, tablaIndex) => {
                    const filas = Array.from(tabla.querySelectorAll('tr')).filter(tr => {
                        return tr.querySelectorAll('td').length > 0;
                    });

                    filas.forEach((fila, filaIndex) => {
                        const celdas = Array.from(fila.querySelectorAll('td'));
                        const datos = celdas.map(celda => celda.innerText?.trim() || '');
                        
                        if (datos.length > 0) {
                            todosLosResultados.push({
                                tabla: tablaIndex + 1,
                                fila: filaIndex + 1,
                                datos: datos,
                                raw: datos.join(' | ')
                            });
                        }
                    });
                });

                return todosLosResultados;
            });

            // Filtrar por cédula
            const serviciosFiltrados = todosLosDatos.filter(item => 
                item.raw.toLowerCase().includes(cedula.toLowerCase())
            );

            console.log(`[SCRAPER] Búsqueda alternativa: ${serviciosFiltrados.length} resultados`);

            await browser.close();

            return {
                success: true,
                tipo: 'agendamiento',
                cedula: cedula,
                total: serviciosFiltrados.length,
                servicios: serviciosFiltrados,
                mensaje: serviciosFiltrados.length > 0 
                    ? `Se encontraron ${serviciosFiltrados.length} registro(s) en agendamiento para la cédula ${cedula}`
                    : `No se encontraron registros en agendamiento para la cédula ${cedula}`,
                metodo: 'busqueda_alternativa'
            };
        }

        await browser.close();

        return {
            success: true,
            tipo: 'agendamiento',
            cedula: cedula,
            total: servicios.length,
            servicios: servicios,
            mensaje: servicios.length > 0 
                ? `Se encontraron ${servicios.length} registro(s) en agendamiento para la cédula ${cedula}`
                : `No se encontraron registros en agendamiento para la cédula ${cedula}`,
            metodo: 'tabla_principal'
        };

    } catch (error) {
        console.error('[ERROR]', error);
        
        if (browser) {
            await browser.close();
        }

        return {
            success: false,
            error: true,
            tipo: 'agendamiento',
            cedula: cedula,
            mensaje: `Error al consultar agendamiento: ${error.message}`,
            detalle: error.stack
        };
    }
}

// Health Check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mensaje: 'Servidor OnTimeCar Scraper funcionando correctamente',
        version: '1.1.0',
        tipo: 'Scraper Agendamiento - ESTRUCTURA CORREGIDA',
        timestamp: new Date().toISOString()
    });
});

// Endpoint principal: Agendamiento
app.get('/consulta/agendamiento', async (req, res) => {
    try {
        const cedula = req.query.cedula;
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El parámetro "cedula" es requerido'
            });
        }
        const resultado = await consultarAgendamiento(cedula);
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

// Endpoint POST alternativo
app.post('/consulta/agendamiento', async (req, res) => {
    try {
        const { cedula } = req.body;
        
        if (!cedula) {
            return res.status(400).json({
                error: true,
                mensaje: 'El campo "cedula" es requerido en el body'
            });
        }

        const resultado = await consultarAgendamiento(cedula);
        res.json(resultado);
    } catch (error) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        servicio: 'OnTimeCar Scraper API - Agendamiento',
        version: '1.1.0',
        descripcion: 'Scraper especializado para la tabla datatable de agendamiento',
        endpoints: {
            health: 'GET /health',
            agendamiento_get: 'GET /consulta/agendamiento?cedula=NUMERO',
            agendamiento_post: 'POST /consulta/agendamiento (body: { "cedula": "NUMERO" })'
        }
    });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: true,
        mensaje: 'Endpoint no encontrado',
        ruta: req.path,
        endpoints_disponibles: ['/health', '/consulta/agendamiento']
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor OnTimeCar Scraper (Agendamiento) iniciado`);
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`🌐 Endpoints:`);
    console.log(`   - GET  /consulta/agendamiento?cedula=NUMERO`);
    console.log(`   - POST /consulta/agendamiento`);
    console.log(`🔐 Usuario: ${ONTIMECAR_CONFIG.username}`);
});
