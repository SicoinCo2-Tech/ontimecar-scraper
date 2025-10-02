// REEMPLAZAR en tu server.js desde la línea 139 (Paso 8) en adelante:

console.log(`Paso 8: Buscando EXACTAMENTE: ${numeroAutorizacion}`);

// CAMBIO CRÍTICO: Buscar en columna específica con búsqueda exacta
await page.evaluate((numAuth, colIndex) => {
    const table = $('#datatable').DataTable();
    // Búsqueda exacta usando regex con ^ y $ (inicio y fin exacto)
    table.column(colIndex).search('^' + numAuth + '$', true, false).draw();
}, numeroAutorizacion, config.columnaAutorizacion);

await page.waitForTimeout(5000);

console.log('Paso 9: Mostrando todos los resultados filtrados...');
await page.evaluate(() => {
    const table = $('#datatable').DataTable();
    table.page.len(-1).draw();
});

await page.waitForTimeout(8000);

console.log('Paso 10: Extrayendo datos con deduplicación...');

const datos = await page.evaluate((numAuthBuscado, colAutorizacion) => {
    const rows = document.querySelectorAll('#datatable tbody tr');
    const resultados = [];
    const autorizacionesVistas = new Set(); // Para deduplicar
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        
        if (cells.length > 10 && !row.classList.contains('dataTables_empty')) {
            const numAutorizacionFila = cells[colAutorizacion]?.innerText.trim() || '';
            
            // Verificación EXACTA (no contains)
            if (numAutorizacionFila !== numAuthBuscado) {
                return;
            }
            
            // DEDUPLICACIÓN: Si ya procesamos esta fila exacta, saltarla
            const identificadorUnico = `${numAutorizacionFila}-${cells[3]?.innerText.trim()}-${cells[4]?.innerText.trim()}`;
            if (autorizacionesVistas.has(identificadorUnico)) {
                console.log('Fila duplicada detectada y omitida:', identificadorUnico);
                return;
            }
            autorizacionesVistas.add(identificadorUnico);
            
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
    
    console.log(`Total de registros únicos encontrados: ${resultados.length}`);
    return resultados;
}, numeroAutorizacion, config.columnaAutorizacion);
