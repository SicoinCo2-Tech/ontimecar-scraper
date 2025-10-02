// ============================================
// ENDPOINT 1: Agendamientos (ontimecar.co)
// REEMPLAZAR SOLO ESTE ENDPOINT - Dejar autorizaciones igual
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
        
        console.log('Paso 9: Configurando para mostrar 100 resultados...');
        
        // CAMBIO CLAVE: Mostrar 100 en lugar de -1
        await page.evaluate(() => {
            const table = $('#datatable').DataTable();
            table.page.len(100).draw();
        });
        
        await page.waitForTimeout(8000);
        
        console.log('Paso 10: Extrayendo datos...');
        
        const datos = await page.evaluate((numAuthBuscado) => {
            const rows = document.querySelectorAll('#datatable tbody tr');
            const resultados = [];
            
            console.log(`Total de filas visibles: ${rows.length}`);
            
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                
                if (cells.length > 10 && !row.classList.contains('dataTables_empty')) {
                    const numAutorizacionFila = cells[12]?.innerText.trim() || '';
                    
                    // Validación exacta
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
            
            console.log(`Registros extraídos: ${resultados.length}`);
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
