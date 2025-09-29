const puppeteer = require("puppeteer");
const express = require("express");
const app = express();

app.get("/consulta/agendamiento", async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) {
    return res.status(400).json({ error: "Debe enviar un número de cédula" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Ir al login
    await page.goto("https://URL_DE_LOGIN", { waitUntil: "networkidle2" });

    // Iniciar sesión (ajusta los selectores según tu sistema)
    await page.type("#username", process.env.USER);
    await page.type("#password", process.env.PASS);
    await page.click("#btnLogin");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // Ir directamente al módulo de Agendamiento
    await page.goto("https://URL_DEL_AGENDAMIENTO", {
      waitUntil: "networkidle2",
    });

    // Buscar por cédula
    await page.type("#campoBusquedaCedula", cedula);
    await page.click("#btnBuscar");
    await page.waitForSelector("#tablaAgendamiento");

    // Extraer todas las filas de agendamiento
    const resultados = await page.evaluate(() => {
      const filas = document.querySelectorAll("#tablaAgendamiento tbody tr");
      const data = [];

      filas.forEach(fila => {
        data.push({
          fechaCita: fila.querySelector("td:nth-child(3)")?.innerText || "",
          identificacionUsuario: fila.querySelector("td:nth-child(4)")?.innerText || "",
          nombreUsuario: fila.querySelector("td:nth-child(5)")?.innerText || "",
          telefonoUsuario: fila.querySelector("td:nth-child(6)")?.innerText || "",
          ciudadOrigen: fila.querySelector("td:nth-child(7)")?.innerText || "",
          direccionOrigen: fila.querySelector("td:nth-child(8)")?.innerText || "",
          ciudadDestino: fila.querySelector("td:nth-child(9)")?.innerText || "",
          ipsDestino: fila.querySelector("td:nth-child(10)")?.innerText || "",
          numeroAutorizacion: fila.querySelector("td:nth-child(11)")?.innerText || "",
          cantidadServicios: fila.querySelector("td:nth-child(12)")?.innerText || "",
          fechaVigencia: fila.querySelector("td:nth-child(13)")?.innerText || "",
          horaRecogida: fila.querySelector("td:nth-child(14)")?.innerText || "",
          horaRetorno: fila.querySelector("td:nth-child(15)")?.innerText || "",
          nombreAcompanante: fila.querySelector("td:nth-child(16)")?.innerText || "",
          identificacionAcompanante: fila.querySelector("td:nth-child(17)")?.innerText || "",
          parentesco: fila.querySelector("td:nth-child(18)")?.innerText || "",
          telefonoAcompanante: fila.querySelector("td:nth-child(19)")?.innerText || "",
          conductor: fila.querySelector("td:nth-child(20)")?.innerText || "",
          celular: fila.querySelector("td:nth-child(21)")?.innerText || "",
          observaciones: fila.querySelector("td:nth-child(22)")?.innerText || "",
          estado: fila.querySelector("td:nth-child(23)")?.innerText || "",
        });
      });

      return data;
    });

    if (resultados.length === 0) {
      return res.json({ error: "No se encontró ningún registro de agendamiento para esta cédula." });
    }

    await browser.close();
    res.json(resultados);

  } catch (error) {
    if (browser) await browser.close();
    console.error("Error en la consulta:", error);
    res.status(500).json({ error: "Error al consultar agendamiento", detalle: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
