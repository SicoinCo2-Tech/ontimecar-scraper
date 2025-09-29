// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = 3000;

app.use(express.json());

// Función para hacer el scraping (la lógica de consulta)
async function consultarServicios(cedula) {
    if (!cedula) {
        return { error: true, mensaje: "Debe proporcionar una cédula/ID." };
    }

    // Lógica de Puppeteer para simular la navegación y obtener el resultado
    // NOTA: Esta es una SIMULACIÓN. Debes reemplazar esto con el código REAL de raspado.
    // Por ahora, solo simulará datos basados en un ID de ejemplo.
    
    console.log(`[SCRAPER] Iniciando consulta para ID: ${cedula}`);

    let browser;
    try {
        // Inicializar Puppeteer (necesario para la imagen Docker)
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        // Simulación: Esperar un momento y devolver datos de prueba
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        if (cedula === '1087549965' || cedula === '1087549964') {
            return { 
                autorizaciones: true, 
                servicios: [
                    { tipo: 'Médico', origen: 'Casa', destino: 'Hospital X', fecha: '2025-10-15' },
                    { tipo: 'Terapia', origen: 'Clínica', destino: 'Casa', fecha: '2025-10-16' }
                ],
                mensaje: `Servicios activos encontrados para el ID: ${cedula}`
            };
        } else {
            return { 
                autorizaciones: false, 
                servicios: [], 
                mensaje: `No se encontraron servicios activos para el ID: ${cedula}` 
            };
        }

    } catch (error) {
        console.error("Error en el raspado:", error);
        return { error: true, mensaje: `Fallo interno del servidor: ${error.message}` };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Endpoint de Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mensaje: 'Servidor OnTimeCar funcionando' });
});

// Endpoint de Consulta
app.get('/consulta', async (req, res) => {
    const cedula = req.query.cedula;
    const resultado = await consultarServicios(cedula);
    res.json(resultado);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de raspado corriendo en http://localhost:${PORT}`);
});
