import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();
const token = process.env.LMS_TOKEN;
const paymentUrl = "https://api.vanalms.com/v1/payments";

(async function () {
  try {
    let allPayments = [];
    let currentPage = 1;
    let lastPage = 1;

    console.log("Iniciando la recopilación de todos los pagos...");

    do {
      console.log(`Obteniendo página ${currentPage} de ${lastPage}...`);

      const data = JSON.stringify({
        data: {
          page: currentPage,
          sort: "asc",
          status: ["processing"],
          image: false,
          country: [],
        },
      });

      const config = {
        method: "post",
        maxBodyLength: Infinity,
        url: paymentUrl,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        data: data,
      };

      const response = await axios.request(config);
      const responseData = response.data.data;

      // Concatenar los items de la página actual
      allPayments = allPayments.concat(responseData.data);

      // Actualizar información de paginación
      lastPage = responseData.last_page;
      currentPage++;

      console.log(
        `Página ${currentPage - 1} completada. Total acumulado: ${
          allPayments.length
        } pagos`
      );

      // Pequeña pausa para no sobrecargar el API
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (currentPage <= lastPage);

    console.log(
      `\nRecopilación completa. Total de pagos: ${allPayments.length}`
    );

    // Guardar todos los pagos en un archivo JSON
    const outputFileName = `logs/all-legacy-payments.json`;
    fs.writeFileSync(outputFileName, JSON.stringify(allPayments, null, 2));

    console.log(`Datos guardados en: ${outputFileName}`);
  } catch (error) {
    console.log("Error fetching payments data:", error.message);
    if (error.response) {
      console.log("Response status:", error.response.status);
      console.log("Response data:", error.response.data);
    }
  }
})();
