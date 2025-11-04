import AWS from "aws-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para guardar items fallidos
async function saveFailedItem(item, error, failedItems) {
  const failedData = {
    timestamp: new Date().toISOString(),
    error: error.message,
    item: item,
    pk: item.pk,
    sk: item.sk,
  };

  failedItems.push(failedData);
  console.log(`📝 Item fallido agregado a la lista: ${item.pk}`);
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
  const fileName = `failed-items-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const allFailedData = {
    summary: {
      totalFailed: failedItems.length,
      timestamp: new Date().toISOString(),
      tableName: TABLE_NAME,
      typeValue: TYPE_VALUE,
      statusFilter: "pending",
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

// Función para guardar todos los items con status pending
async function savePendingItems(pendingItems) {
  if (pendingItems.length === 0) {
    console.log("✅ No hay items con status pending");
    return;
  }

  const logsDir = path.join(__dirname, "logs");

  // Crear directorio logs si no existe
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `pending-payments-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const pendingData = {
    summary: {
      totalPending: pendingItems.length,
      timestamp: new Date().toISOString(),
      tableName: TABLE_NAME,
      typeValue: TYPE_VALUE,
    },
    pendingItems: pendingItems,
  };

  try {
    await fs.promises.writeFile(filePath, JSON.stringify(pendingData, null, 2));
    console.log(`📁 Todos los items pending guardados en: ${fileName}`);
    console.log(`📊 Total de items pending: ${pendingItems.length}`);
  } catch (writeError) {
    console.error(
      `❌ Error guardando archivo de items pending:`,
      writeError.message
    );
  }
}

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME || "costumer_tickets_records_dev";
const TYPE_INDEX = process.env.TYPE_INDEX || "type_sk_index";
const TYPE_VALUE = "TICKET_PAYMENT";

// Configura aquí el rango de fechas que deseas consultar (opcional)
const START_DATE = process.env.START_DATE || "";
const END_DATE = process.env.END_DATE || "";

console.log("START_DATE :>> ", START_DATE);
console.log("END_DATE :>> ", END_DATE);

async function init() {
  let lastEvaluatedKey = undefined;
  let totalCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  const failedItems = [];
  const pendingItems = [];
  const batchSize = Number(process.env.BATCH_SIZE) || 500;

  console.log("Iniciando consulta de TICKET_PAYMENT...");
  console.log(`Tabla: ${TABLE_NAME}`);
  console.log(`Índice: ${TYPE_INDEX}`);
  if (START_DATE && END_DATE) {
    console.log(`Rango de fechas: ${START_DATE} hasta ${END_DATE}`);
  }
  console.log("----------------------------------------");

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: TYPE_INDEX,
      KeyConditionExpression: "#type = :typeValue",
      ExpressionAttributeNames: {
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":typeValue": TYPE_VALUE,
      },
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: batchSize,
    };

    // Agregar filtro de fechas si están configuradas
    if (START_DATE && END_DATE) {
      params.FilterExpression = "#updated_at BETWEEN :startDate AND :endDate";
      params.ExpressionAttributeNames["#updated_at"] = "updated_at";
      params.ExpressionAttributeValues[":startDate"] = START_DATE;
      params.ExpressionAttributeValues[":endDate"] = END_DATE;
    }

    try {
      const data = await dynamodb.query(params).promise();

      for (const item of data.Items) {
        totalCount++;

        try {
          console.log("\n");
          console.log("----------------------------------------");
          console.log(`📋 Procesando item ${totalCount}`);
          console.log(`PK: ${item.pk}`);
          console.log(`SK: ${item.sk}`);
          console.log(`Status: ${item.status}`);
          console.log(`Type: ${item.type}`);

          if (item.props) {
            console.log(`Intent ID: ${item.props.intent_id}`);
            console.log(`Loan ID: ${item.props.loan_id}`);
            console.log(`User ID: ${item.props.user_id}`);
            console.log(`Amount: ${item.props.amount}`);
            console.log(`Country: ${item.props.country}`);
            console.log(`Queue: ${item.props.queue}`);
          }

          console.log(`Updated At: ${item.updated_at}`);

          // Verificar si el status es pending
          if (item.status === "pending") {
            pendingCount++;
            pendingItems.push(item);
            console.log(
              `✅ Item con status PENDING encontrado (Total: ${pendingCount})`
            );
          } else {
            console.log(`ℹ️  Item con status: ${item.status}`);
          }

          console.log("----------------------------------------");
        } catch (error) {
          console.error(`❌ Error procesando item ${item.pk}:`, error.message);
          await saveFailedItem(item, error, failedItems);
          failedCount++;
        }
      }

      lastEvaluatedKey = data.LastEvaluatedKey;

      if (lastEvaluatedKey) {
        console.log(
          `\n📊 Procesados ${totalCount} registros. Pending encontrados: ${pendingCount}. Continuando con el siguiente lote...`
        );
      }
    } catch (err) {
      console.error("❌ Error consultando DynamoDB:", err);
      break;
    }
  } while (lastEvaluatedKey);

  console.log("\n");
  console.log("========================================");
  console.log("🎯 RESUMEN DEL PROCESO");
  console.log("========================================");
  console.log(`Total de registros procesados: ${totalCount}`);
  console.log(`Total de items con status PENDING: ${pendingCount}`);
  console.log(`Total de items fallidos: ${failedCount}`);
  console.log("========================================");

  // Guardar todos los items pending en un archivo
  await savePendingItems(pendingItems);

  // Guardar todos los items fallidos en un archivo (si los hay)
  await saveAllFailedItems(failedItems);
}

(async () => {
  try {
    await init();
  } catch (error) {
    console.error("❌ Error en el proceso principal:", error);
  }
})();
