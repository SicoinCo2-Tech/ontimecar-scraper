const express = require("express");
const puppeteer = require("puppeteer");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de acceso a OnTimeCar
const LOGIN_URL = "https://app.ontimecar.co/app/login/?next=/app/home/";
const USER = "ANDRES";
const PASS = "IAResponsable";

// Helper para mapear los datos de la tabla
function consultarPorCedula(tabla, cedula) {
  const resultados = tabla.filter(r => String(r["Identificación usuario"]).trim() === String(cedula).trim());

  if (resultados.length === 0) {
    return { error: "No se encontró ningún registro con la cédula indicada." };
  }

  const registro = resultados[0];

  return {
    identificacion_usuario: registro["Identificación usuario"] || null,
    fecha_cita: registro["Fecha de cita"] || null,
    fecha_vigencia: registro["Fecha vigencia"] || null,
    direccion_origen: registro["Dirección origen"] || null,
    hora_recogida: registro["Hora recogida"] || null,
    hora_retorno: registro["Hora retorno"] || null,
    nombre_acompanante: registro["Nombre acompañante"] || null,
    identificacion_acompanante: registro["Identificación acompañante"] || null,
    parentesco: registro["Parentesco"] || null,
    telefono_acompanante: registro["Teléfono acompañante"] || null,
    observaciones: registro["Observaciones"] || null,
    ips_destino: registro["IPS destino"] || null,
    estado: registro["Estado"] || "DESCONOCIDO"
  };
}

// Endpoint para consultar agendamiento por cédula
app.get("/consulta/agendamiento", async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) {
    return res.status(400).json({ error: "Debe enviar la cédula como query param ?cedula=" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    // Login
    await page.type("input[name='username']", USER);
    await page.type("input[name='password']", PASS);
    await page.click("button[type='submit']");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Ir a la sección de Agendamiento
    await page.goto("https://app.ontimecar.co/app/agendamiento", { waitUntil: "networkidle2" });

    // Extraer datos de la tabla
    const tabla = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll("table thead th")).map(h => h.innerText.trim());
      const rows = Array.from(document.querySelectorAll("table tbody tr"));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll("td"));
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = cells[i] ? cells[i].innerText.trim() : null;
        });
        return obj;
      });
    });

    // Procesar por cédula
    const resultado = consultarPorCedula(tabla, cedula);

    res.json(resultado);

  } catch (error) {
    console.error("Error en el scraper:", error);
    res.status(500).json({ error: "Error al ejecutar el scraper", detalle: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Servidor Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Scraper corriendo en http://localhost:${PORT}`);
});
