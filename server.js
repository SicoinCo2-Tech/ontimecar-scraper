import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = 3000;

// Configuración de columnas para cada área
const configAreas = {
  autorizaciones: {
    skip: 0,
    columnas: [
      "Acciones",
      "Fecha Emisión",
      "Fecha Final",
      "Tipo de Afiliado",
      "Nombre Afiliado",
      "Clase",
      "Número",
      "Estado",
      "Código",
      "Cantidad",
      "N. Prescripción",
      "Ciudad Origen",
      "Dir. Origen",
      "Ciudad Destino",
      "Dirección Destino",
      "EPS",
      "Cantidad Servicios",
      "Subir Autorización",
      "Observaciones",
      "Nombre ACO",
      "Parentesco",
      "Teléfono ACO",
      "Tipo Documento ACO",
      "Número Documento ACO",
      "Agendamientos Existentes"
    ]
  },
  agendamiento: {
    skip: 0,
    columnas: [
      "Fecha de cita",
      "Identificación usuario",
      "Nombre usuario",
      "Teléfono usuario",
      "Zona",
      "Ciudad origen",
      "Dirección origen",
      "Ciudad destino",
      "IPS destino",
      "Número autorización",
      "Cantidad de servicios autorizados",
      "Fecha vigencia",
      "Hora recogida",
      "Hora retorno",
      "Nombre acompañante",
      "Identificación acompañante",
      "Parentesco",
      "Teléfono acompañante",
      "Conductor",
      "Celular",
      "Observaciones",
      "Estado"
    ]
  },
  programacion: {
    skip: 0,
    columnas: [
      "WH Enviado",
      "Correo Enviado",
      "Fecha Cita",
      "Nombre Paciente",
      "Número Tel Afiliado",
      "Documento",
      "Ciudad Origen",
      "Dir Origen",
      "Ciudad Destino",
      "Dir Destino",
      "Hora Recogida",
      "Hora Retorno",
      "Conductor",
      "EPS",
      "Observaciones",
      "Correo",
      "Zona",
      "Autorización"
    ]
  }
};

// Función para scrapear tablas según el área
async function extraerTabla(page, config, cedulaBuscada) {
  return await page.evaluate((config, cedulaBuscada) => {
    const tablas = [
      document.querySelector("table tbody"),
      document.querySelector(".table tbody"),
      document.querySelector(".dataTable tbody"),
      document.querySelector('[class*="table"] tbody')
    ].filter(t => t !== null);

    if (tablas.length === 0) {
      return [];
    }

    const tbody = tablas[0];
    const filas = Array.from(tbody.querySelectorAll("tr"));

    return filas.map(fila => {
      const celdas = Array.from(fila.querySelectorAll("td"));
      if (celdas.length === 0) return null;

      const datos = celdas.map(celda => {
        const input = celda.querySelector("input");
        if (input) return input.value?.trim() || "";

        const select = celda.querySelector("select");
        if (select) {
          const selected =
            select.options[select.selectedIndex]?.textContent || select.value;
          return selected.trim();
        }

        const textarea = celda.querySelector("textarea");
        if (textarea) return textarea.value?.trim() || "";

        return celda.innerText?.trim() || "";
      });

      const textoFila = datos.join(" ");
      const contieneCedula = textoFila.includes(cedulaBuscada);

      const datosRelevantes = datos.slice(config.skip);

      const registro = {
        _contieneCedula: contieneCedula,
        _totalColumnas: datos.length,
        _primeras10Columnas: datos.slice(0, 10),
        _ultimas5Columnas: datos.slice(-5)
      };

      config.columnas.forEach((nombreColumna, index) => {
        registro[nombreColumna] = datosRelevantes[index] || "";
      });

      return registro;
    }).filter(servicio => servicio !== null);
  }, config, cedulaBuscada);
}

// Endpoint principal
app.get("/scrapear", async (req, res) => {
  const cedula = req.query.cedula || "";

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("URL_DE_TU_PORTAL", { waitUntil: "networkidle2" });

  const resultados = {};

  // Recorremos cada área
  for (const area in configAreas) {
    resultados[area] = await extraerTabla(page, configAreas[area], cedula);
  }

  await browser.close();
  res.json(resultados);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
