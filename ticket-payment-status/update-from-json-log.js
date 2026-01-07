import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para guardar items fallidos
async function saveFailedItem(item, error, failedItems) {
  const failedData = {
    timestamp: new Date().toISOString(),
    error: error.message,
    errorStack: error.stack,
    item: item,
    pk: item.ticket.pk,
    sk: item.ticket.sk,
    attemptedUpdate: {
      from: "pending",
      to: "completed",
    },
  };

  failedItems.push(failedData);
  console.log(`📝 Item fallido agregado a la lista: ${item.ticket.pk}`);
}

// Función para guardar todos los items fallidos en un solo archivo
async function saveAllFailedItems(failedItems) {
  if (failedItems.length === 0) {
    console.log("✅ No hay items fallidos para guardar");
    return;
  }

  const logsDir = path.join(__dirname, "logs");

  // Crear directorio logs si no existe
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `failed-updates-from-json-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const allFailedData = {
    summary: {
      totalFailed: failedItems.length,
      timestamp: new Date().toISOString(),
      operation: "update status pending to completed from JSON log",
    },
    failedItems: failedItems,
  };

  try {
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(allFailedData, null, 2)
    );
    console.log(`📁 Todos los items fallidos guardados en: ${fileName}`);
    console.log(`📊 Total de items fallidos: ${failedItems.length}`);
  } catch (writeError) {
    console.error(
      `❌ Error guardando archivo de items fallidos:`,
      writeError.message
    );
  }
}

// Función para guardar todos los items actualizados exitosamente
async function saveSuccessfulUpdates(successfulItems) {
  if (successfulItems.length === 0) {
    console.log("✅ No hay items actualizados para guardar");
    return;
  }

  const logsDir = path.join(__dirname, "logs");

  // Crear directorio logs si no existe
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `successful-updates-from-json-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const successData = {
    summary: {
      totalUpdated: successfulItems.length,
      timestamp: new Date().toISOString(),
      operation: "update status pending to completed from JSON log",
    },
    updatedItems: successfulItems,
  };

  try {
    await fs.promises.writeFile(filePath, JSON.stringify(successData, null, 2));
    console.log(`📁 Todos los items actualizados guardados en: ${fileName}`);
    console.log(`📊 Total de items actualizados: ${successfulItems.length}`);
  } catch (writeError) {
    console.error(
      `❌ Error guardando archivo de items actualizados:`,
      writeError.message
    );
  }
}

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME || "costumer_tickets_records_dev";
const JSON_FILE_PATH =
  process.env.JSON_FILE_PATH ||
  path.join(__dirname, "logs", "pending-tickets-fulfilled-1767811914354.json");

async function init() {
  let totalCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failedItems = [];
  const successfulItems = [];

  console.log("Iniciando actualización de tickets desde archivo JSON...");
  console.log(`Tabla: ${TABLE_NAME}`);
  console.log(`Archivo JSON: ${JSON_FILE_PATH}`);
  console.log("----------------------------------------");

  try {
    // Leer el archivo JSON
    const fileContent = await fs.promises.readFile(JSON_FILE_PATH, "utf-8");
    const jsonData = JSON.parse(fileContent);

    console.log(`📋 Total de items en el archivo: ${jsonData.items.length}`);
    console.log("----------------------------------------\n");

    // Procesar cada item del archivo JSON
    for (const item of jsonData.items) {
      totalCount++;

      try {
        console.log("\n");
        console.log("----------------------------------------");
        console.log(
          `📋 Procesando item ${totalCount}/${jsonData.items.length}`
        );

        const ticket = item.ticket;
        const pk = ticket.pk;
        const sk = ticket.sk;
        const currentStatus = ticket.ticket_status;

        console.log(`PK: ${pk}`);
        console.log(`SK: ${sk}`);
        console.log(`Status actual: ${currentStatus}`);

        // Verificar que el ticket tenga status pending
        if (currentStatus !== "pending") {
          console.log(
            `⏭️ Item omitido (status: ${currentStatus}, esperado: pending)`
          );
          skippedCount++;
          continue;
        }

        // Actualizar el status a completed
        try {
          const updateParams = {
            TableName: TABLE_NAME,
            Key: {
              pk: pk,
            },
            UpdateExpression:
              "SET #status = :completed, #updated_at = :now",
            ExpressionAttributeNames: {
              "#status": "status",
              "#updated_at": "updated_at",
            },
            ConditionExpression: "#status = :pending", // Solo actualizar si sigue siendo pending
            ExpressionAttributeValues: {
              ":completed": "completed",
              ":pending": "pending",
              ":now": new Date().toISOString(),
            },
            ReturnValues: "ALL_NEW",
          };

          const result = await dynamodb.update(updateParams).promise();
          updatedCount++;

          console.log(
            `🎉 Status actualizado exitosamente: pending → completed`
          );
          console.log(`🕐 Nuevo updated_at: ${result.Attributes.updated_at}`);

          successfulItems.push({
            pk: pk,
            sk: sk,
            oldStatus: "pending",
            newStatus: "completed",
            updatedAt: result.Attributes.updated_at,
            props: ticket.props,
          });
        } catch (updateError) {
          console.error(
            `❌ Error actualizando item ${pk}:`,
            updateError.message
          );
          await saveFailedItem(item, updateError, failedItems);
          failedCount++;
        }

        console.log("----------------------------------------");
      } catch (error) {
        console.error(`❌ Error procesando item ${totalCount}:`, error.message);
        await saveFailedItem(item, error, failedItems);
        failedCount++;
      }
    }

    console.log("\n");
    console.log("========================================");
    console.log("🎯 RESUMEN DEL PROCESO");
    console.log("========================================");
    console.log(`Total de registros procesados: ${totalCount}`);
    console.log(`Total de items ACTUALIZADOS exitosamente: ${updatedCount}`);
    console.log(`Total de items OMITIDOS (no pending): ${skippedCount}`);
    console.log(`Total de items FALLIDOS: ${failedCount}`);
    console.log("========================================");

    // Guardar todos los items actualizados exitosamente
    await saveSuccessfulUpdates(successfulItems);

    // Guardar todos los items fallidos en un archivo (si los hay)
    await saveAllFailedItems(failedItems);
  } catch (error) {
    console.error("❌ Error leyendo archivo JSON:", error.message);
    throw error;
  }
}

(async () => {
  try {
    await init();
  } catch (error) {
    console.error("❌ Error en el proceso principal:", error);
  }
})();
