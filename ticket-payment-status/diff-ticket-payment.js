import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const token = process.env.LMS_TOKEN;

const ticketsUrl = "https://api.vanalms.com/v1/tickets";

// Función auxiliar para obtener tickets con un payload específico
async function fetchTicketsWithPayload(basePayload, snoozedValue, label) {
  let tickets = [];
  let currentPage = 1;
  let hasMorePages = true;

  console.log(`\n=== Obteniendo tickets ${label} ===`);

  do {
    console.log(`Obteniendo página ${currentPage} (${label})...`);

    const payload = {
      data: {
        ...basePayload,
        page: currentPage,
        ...(snoozedValue !== undefined && { snoozed: snoozedValue }),
      },
    };

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: ticketsUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: JSON.stringify(payload),
    };

    const response = await axios.request(config);
    const responseData = response.data.data;

    // Concatenar los items de la página actual
    const items = responseData.items || [];
    tickets = tickets.concat(items);

    console.log(
      `Página ${currentPage} completada. Items en esta página: ${items.length}. Total acumulado (${label}): ${tickets.length} tickets`
    );

    // Verificar si hay más páginas
    if (items.length < 50) {
      hasMorePages = false;
      console.log(
        `Última página alcanzada para ${label} (items recibidos < límite de 50)`
      );
    } else {
      currentPage++;
      // Pequeña pausa para no sobrecargar el API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } while (hasMorePages);

  console.log(`Total de tickets ${label}: ${tickets.length}`);
  return tickets;
}

(async function () {
  try {
    console.log("Iniciando la recopilación de todos los tickets de pago...");

    const basePayload = {
      type: "payment",
      status: "pending",
      queue: "review",
      country: [],
      sort: "asc",
      limit: 50,
    };

    // Obtener tickets sin snoozed (o snoozed: false)
    const regularTickets = await fetchTicketsWithPayload(
      basePayload,
      undefined,
      "regulares (sin snoozed)"
    );

    // Obtener tickets con snoozed: true
    const snoozedTickets = await fetchTicketsWithPayload(
      basePayload,
      true,
      "snoozed"
    );

    // Concatenar ambos resultados
    const allTickets = regularTickets.concat(snoozedTickets);

    console.log(`\n=== RESUMEN ===`);
    console.log(`Tickets regulares: ${regularTickets.length}`);
    console.log(`Tickets snoozed: ${snoozedTickets.length}`);
    console.log(`Total de tickets: ${allTickets.length}`);

    // Guardar todos los tickets en un archivo JSON
    const outputFileName = `logs/all-payment-tickets.json`;
    fs.writeFileSync(outputFileName, JSON.stringify(allTickets, null, 2));

    console.log(`\nDatos guardados en: ${outputFileName}`);
  } catch (error) {
    console.log("Error fetching ticket data:", error.message);
    if (error.response) {
      console.log("Response status:", error.response.status);
      console.log("Response data:", JSON.stringify(error.response.data));
    }
  }
})();
