// ALTERNATIVA: Si el método anterior no funciona, usa ESTE en su lugar
// Reemplaza desde el Paso 9 hasta antes de extraer datos

console.log('Paso 9: MÉTODO ALTERNATIVO - Iterando TODAS las páginas...');

const todosLosDatos = await page.evaluate((numAuthBuscado, colAutorizacion) => {
    const table = $('#datatable').DataTable();
    const info = table.page.info();
    const totalPaginas = info.pages;
    const resultadosCompletos = [];
    
    console.log(`Total de páginas a procesar: ${totalPaginas}`);
    
    // Iterar cada página manualmente
    for (let paginaActual = 0; paginaActual < totalPaginas; paginaActual++) {
        console.log(`Procesando página ${paginaActual + 1}/${totalPaginas}...`);
        
        // Ir a la página específica
        table.page(paginaActual).draw(false);
        
        // Extraer datos de esta página
        const rows = document.querySelectorAll('#datatable tbody tr:not(.dataTables_empty)');
        
        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            
            if (cells.length > 10) {
                const numAutorizacionFila = cells[colAutorizacion]?.innerText.trim() || '';
                
                // Verificar coincidencia
                if (numAutorizacionFila.replace(/\s+/g, '') !== numAuthBuscado.replace(/\s+/g, '')) {
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

                // Detectar color
                const rowStyle = window.getComputedStyle(row);
                const bgColor = rowStyle.backgroundColor;
                let colorCategoria = 'otro';
                
                if (bgColor.includes('144, 238, 144') || bgColor.includes('lightgreen') || 
                    bgColor.includes('rgba(144, 238, 144') || bgColor.includes('rgb(144, 238, 144')) {
                    colorCategoria = 'verde';
                } else if (bgColor.includes('240, 128, 128') || bgColor.includes('lightcoral') ||
                           bgColor.includes('rgba(240, 128, 128') || bgColor.includes('rgb(240, 128, 128')) {
                    colorCategoria = 'rojo';
                }

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
                    estado: cells[24]?.innerText.trim() || '',
                    _metadata: {
                        color_fila: colorCategoria,
                        pagina_origen: paginaActual + 1
                    }
                };
                
                resultadosCompletos.push(registro);
                console.log(`  ✅ Registro agregado de página ${paginaActual + 1}`);
            }
        });
    }
    
    // Calcular estadísticas
    const estadisticas = {
        total: resultadosCompletos.length,
        porColor: {
            verde: resultadosCompletos.filter(r => r._metadata.color_fila === 'verde').length,
            rojo: resultadosCompletos.filter(r => r._metadata.color_fila === 'rojo').length,
            otro: resultadosCompletos.filter(r => r._metadata.color_fila === 'otro').length
        },
        porEstado: {}
    };
    
    resultadosCompletos.forEach(r => {
        estadisticas.porEstado[r.estado] = (estadisticas.porEstado[r.estado] || 0) + 1;
    });
    
    console.log(`=== EXTRACCIÓN COMPLETA ===`);
    console.log(`Total registros: ${estadisticas.total}`);
    console.log(`Verdes: ${estadisticas.porColor.verde}, Rojos: ${estadisticas.porColor.rojo}`);
    
    return { registros: resultadosCompletos, estadisticas: estadisticas };
}, numeroAutorizacion, config.columnaAutorizacion);

const datos = todosLosDatos;
console.log(`Extracción finalizada: ${datos.registros.length} registros totales`);
