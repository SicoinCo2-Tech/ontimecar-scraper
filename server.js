// server.js - Scraper OnTimeCar: ROBUSTEZ Y EXTRACCIÓN GARANTIZADA
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

// Credenciales de OnTimeCar (ESTO DEBE SER REVISADO POR TU AMIGO)
const ONTIMECAR_CONFIG = {
    loginUrl: 'https://app.ontimecar.co/app/home/',
    username: 'ANDRES',
    password: 'IAResponsable',
    agendamientoUrl: 'https://app.ontimecar.co/app/agendamiento/',
    // Columna de Cédula/Identificación del USUARIO en la tabla: Índice 4 (Quinta Columna)
    COLUMNA_IDENTIFICACION: 4 
};

// Función mejorada para datos dinámicos
async function consultarAgendamiento(cedula) {
    let browser = null;
    
    try {
        console.log(`[SCRAPER] Iniciando consulta de agendamiento para cédula: ${cedula}`);
        
        // 1. Lanzar navegador con argumentos de estabilidad para Easypanel
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
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);
        await page.setViewport({ width: 1366, height: 768 });

        // PASO 1: Hacer login
        await page.goto(ONTIMECAR_CONFIG.loginUrl, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Esperar inputs de login y escribirlos
        const [usernameInput, passwordInput] = await Promise.all([
            page.waitForSelector('input[type="text"], input[name="username"]', { timeout: 15000 }),
            page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 15000 })
        ]);

        if (!usernameInput || !passwordInput) {
            throw new Error('No se pudieron encontrar los campos de login');
        }

        await page.evaluate((username, password) => {
            const userField = document.querySelector('input[type="text"], input[name="username"]');
            const passField = document.querySelector('input[type="password"], input[name="password"]');
            
            if (userField) userField.value = username;
            if (passField) passField.value = password;
            
            // Intenta hacer click en el botón de login
            const loginButton = document.querySelector('button[type="submit"], input[type="submit"], .login-button');
            if (loginButton) loginButton.click();
        }, ONTIMECAR_CONFIG.username, ONTIMECAR_CONFIG.password);
        
        // Si el click no funciona, envía 'Enter' como alternativa
        await page.keyboard.press('Enter');
        
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        console.log('[SCRAPER] Login exitoso. Navegando a agendamiento...');

        // PASO 2: Navegar a la página de agendamiento
        await page.goto(ONTIMECAR_CONFIG.agendamientoUrl, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // PASO 3: Esperar a que se carguen los datos en la tabla (usando la clase de filas)
        const selectorTabla = '#datatable tbody tr'; // Esperar cualquier fila de datos
        await page.waitForSelector(selectorTabla, { timeout: 30000 });
        
        // PASO 4: Buscar y usar el campo de búsqueda para filtrar la cédula
        const selectoresBusqueda = ['.dataTables_filter input', 'input[type="search"]', 'input[placeholder*="Buscar"]'];

        for (const selector of selectoresBusqueda) {
            try {
                const campoBusqueda = await page.$(selector);
                if (campoBusqueda) {
                    await campoBusqueda.type(cedula, { delay: 100 });
                    await page.waitForTimeout(5000); // Dar tiempo para el filtro
                    break;
                }
            } catch (e) {
                console.log(`[SCRAPER] Falló búsqueda con ${selector}`);
            }
        }
        
        // PASO 5: Extraer datos de la tabla y FILTRAR ESTRICTAMENTE POR CÉDULA
        console.log('[SCRAPER] Extrayendo y filtrando datos...');
        
        const servicios = await page.evaluate((cedulaBuscada, idColumna) => {
            const tabla = document.querySelector('#datatable');
            if (!tabla) return [];

            const filas = Array.from(tabla.querySelectorAll('tbody tr'));
            const resultados = [];

            filas.forEach((fila, index) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                // Mapeo de los textos de las celdas y limpieza
                const datos = celdas.map(celda => celda.innerText?.trim() || '').map(texto => texto.replace(/\s+/g, ' ').trim());

                // Verificación CRÍTICA: La tabla debe tener suficientes columnas (al menos 20)
                if (datos.length < 20) return; 

                // Extraemos el dato de la cédula de la columna esperada (índice 4)
                const cedulaFila = datos[idColumna] || '';

                // Aplicamos un filtro doble: Si la cédula de la fila existe Y si coincide con la buscada
                if (cedulaFila && cedulaFila.includes(cedulaBuscada)) {
                    
                    const servicio = {
                        // Datos Generales
                        fila: index + 1,
                        identificacion_usuario: datos[4] || 'N/A', 
                        nombre_usuario: datos[5] || '',

                        // Datos de Ruta (Índices según el HTML que enviaste)
                        fechaCita: datos[3] || '',
                        direccionOrigen: datos[9] || '',   // Índice 9: DIRECCIÓN ORIGEN
                        direccionDestino: datos[11] || '',  // Índice 11: IPS DESTINO
                        
                        // Datos de Autorización
                        numeroAutorizacion: datos[12] || '',
                        fechaVigencia: datos[14] || '',
                        estado: datos[24] || '' // Índice 24: ESTADO
                    };
                    
                    resultados.push(servicio);
                }
            });

            return resultados;
        }, cedula, ONTIMECAR_CONFIG.COLUMNA_IDENTIFICACION);

        console.log(`[SCRAPER] Se encontraron ${servicios.length} registros válidos`);
        
        await browser.close();

        return {
            success: true,
            tipo: 'agendamiento',
            cedula: cedula,
            total: servicios.length,
            servicios: servicios,
            mensaje: servicios.length > 0 
                ? `Se encontraron ${servicios.length} registros en agendamiento para la cédula ${cedula}`
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
        mensaje: 'Servidor OnTimeCar Scraper funcionando',
        version: '1.2.1-fix',
        tipo: 'Scraper Agendamiento - Robusto',
        timestamp: new Date().toISOString()
    });
});

// Endpoint principal: Agendamiento (GET)
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
        res.status(500).json({
            error: true,
            mensaje: 'Error interno del servidor',
            detalle: error.message
        });
    }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: true,
        mensaje: 'Endpoint no encontrado'
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor OnTimeCar Scraper (Agendamiento) iniciado`);
    console.log(`📡 Puerto: ${PORT}`);
});
