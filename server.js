const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

// Conexión a PostgreSQL con tus credenciales
const pool = new Pool({
  connectionString: "postgres://Admin:Ha198807078877*@n8nsicoinco2_postgres:5432/n8nsicoinco2",
});

// Endpoint: obtener agendamientos por cédula
app.get("/agendamientos/:cedula", async (req, res) => {
  const cedula = req.params.cedula;

  try {
    // Consulta SOLO agendamientos
    const query = `
      SELECT 
        fecha_vigencia,
        identificacion_usuario,
        fecha_cita,
        direccion_origen,
        hora_recogida,
        hora_retorno,
        nombre_acompanante,
        identificacion_acompanante,
        parentesco,
        telefono_acompanante,
        observaciones,
        ips_destino,
        estado
      FROM agendamientos
      WHERE identificacion_usuario = $1
      ORDER BY fecha_cita ASC
    `;

    const { rows } = await pool.query(query, [cedula]);

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: "No se encontraron agendamientos" });
    }

    res.json({
      cedula,
      total: rows.length,
      agendamientos: rows,
    });
  } catch (error) {
    console.error("Error en la consulta:", error);
    res.status(500).json({ error: "Error obteniendo agendamientos" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
