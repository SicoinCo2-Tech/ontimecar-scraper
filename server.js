// server.js (Simplificado sin Puppeteer)
const express = require('express');
// No necesitamos Puppeteer, solo usaremos express
const app = express();
const PORT = 3000;

app.use(express.json());

// Función para simular la consulta (Eliminamos la complejidad de Puppeteer)
async function consultarServicios(cedula) {
    if (!cedula) {
        return { error: true, mensaje: "Debe proporcionar una cédula/ID." };
    }

    console.log(`[SIMULADOR] Iniciando consulta para ID: ${cedula}`);

    // Simulación: Esperar un momento y devolver datos de prueba
    await new Promise(resolve => setTimeout(resolve, 1000)); // Espera 1s

    // Lógica de datos simulados (la misma que teníamos)
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
}

// Endpoint de Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mensaje: 'Servidor OnTimeCar funcionando y LIGERO.' });
});

// Endpoint de Consulta
app.get('/consulta', async (req, res) => {
    const cedula = req.query.cedula;
    const resultado = await consultarServicios(cedula);
    res.json(resultado);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de raspado corriendo en puerto ${PORT}`);
});
