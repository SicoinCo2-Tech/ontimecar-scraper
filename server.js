// PASO 5: Extraer datos de la tabla y FILTRAR ESTRICTAMENTE POR CÉDULA
        console.log('[SCRAPER] Extrayendo y filtrando datos...');
        
        const servicios = await page.evaluate((cedulaBuscada, idColumna) => {
            const tabla = document.querySelector('#datatable');
            if (!tabla) return [];

            const filas = Array.from(tabla.querySelectorAll('tbody tr'));
            const resultados = [];

            filas.forEach((fila, index) => {
                const celdas = Array.from(fila.querySelectorAll('td'));
                
                // 1. Mapeo de los textos de las celdas y limpieza
                const datos = celdas.map(celda => celda.innerText?.trim() || '').map(texto => texto.replace(/\s+/g, ' ').trim());

                // 2. Verificación MÍNIMA de columnas
                if (datos.length < 20) return; 

                // 3. Extracción y Filtrado (El problema está aquí)
                // Usamos .includes() en la columna de la cédula para mayor tolerancia.
                const cedulaFila = datos[idColumna] || '';
                
                // Si la fila es válida Y la cédula coincide (incluso si la columna está ligeramente desplazada):
                if (cedulaFila.includes(cedulaBuscada) || datos.join(' ').includes(cedulaBuscada)) {
                    
                    const servicio = {
                        // Datos de la Extracción
                        identificacion_usuario: datos[idColumna] || 'N/A', // Mantenemos el índice 4
                        nombre_usuario: datos[5] || '',

                        // Datos de Ruta (Índices CRÍTICOS)
                        fechaCita: datos[3] || '',
                        direccionOrigen: datos[9] || '',   // Índice 9: DIRECCIÓN ORIGEN (PANCILLON POTRERO)
                        direccionDestino: datos[11] || '',  // Índice 11: IPS DESTINO (CLINICA OCCIDENTE)
                        
                        // Datos de Autorización
                        numeroAutorizacion: datos[12] || '',
                        estado: datos[24] || '' // Índice 24: ESTADO
                    };
                    
                    resultados.push(servicio);
                }
            });

            return resultados;
        }, cedula, ONTIMECAR_CONFIG.COLUMNA_IDENTIFICACION);

        console.log(`[SCRAPER] Se encontraron ${servicios.length} registros válidos`);
        
        await browser.close();
        
        // ... (Resto del código de retorno)
