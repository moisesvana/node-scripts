import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenSearchClient } from "./opensearch-client.js";

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
    pk: item.pk,
    sk: item.sk,
    attemptedUpdate: {
      from: "pending",
      to: "completed",
    },
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
  const fileName = `failed-updates-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const allFailedData = {
    summary: {
      totalFailed: failedItems.length,
      timestamp: new Date().toISOString(),
      tableName: TABLE_NAME,
      typeValue: TYPE_VALUE,
      operation: "update status pending to completed",
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
  const fileName = `successful-updates-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const successData = {
    summary: {
      totalUpdated: successfulItems.length,
      timestamp: new Date().toISOString(),
      tableName: TABLE_NAME,
      typeValue: TYPE_VALUE,
      operation: "update status pending to completed",
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
const TYPE_INDEX = process.env.TYPE_INDEX || "type_sk_index";
const TYPE_VALUE = "TICKET_PAYMENT";

// Configura aquí el rango de fechas que deseas consultar (opcional)
const START_DATE = process.env.START_DATE || "";
const END_DATE = process.env.END_DATE || "";

const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const indexName = process.env.OPENSEARCH_INDEX_NAME || "stm_payment_dev";

const secrets = {
  username: username,
  password: password,
};
console.log("secrets :>> ", JSON.stringify(secrets));
const openSearchClient = new OpenSearchClient(nodeName, secrets);

console.log("START_DATE :>> ", START_DATE);
console.log("END_DATE :>> ", END_DATE);

async function init() {
  let lastEvaluatedKey = undefined;
  let totalCount = 0;
  let pendingCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failedItems = [];
  const successfulItems = [];
  const batchSize = Number(process.env.BATCH_SIZE) || 500;

  console.log(
    "Iniciando actualización de TICKET_PAYMENT (pending → completed)..."
  );
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
          console.log(`Status actual: ${item.status}`);
          console.log(`Type: ${item.type}`);

          console.log(`Updated At: ${item.updated_at}`);
          console.log(`Created At: ${item.created_at}`);

          // Verificar si el status es pending
          if (item.status === "pending") {
            pendingCount++;
            console.log(
              `✅ Item con status PENDING encontrado (Total pending: ${pendingCount})`
            );
            const paymentId = item.pk.split("|")[1];
            console.log("paymentId :>> ", paymentId);
            let opStatus = null;
            // try {
            //   const res = await openSearchClient.search({
            //     index: indexName,
            //     queryInput: {
            //       query: {
            //         bool: {
            //           should: [
            //             {
            //               term: {
            //                 "remote_id.keyword": paymentId,
            //               },
            //             },
            //             {
            //               term: {
            //                 "shadow_id.keyword": paymentId,
            //               },
            //             },
            //             {
            //               term: {
            //                 "intent_id.keyword": paymentId,
            //               },
            //             },
            //           ],
            //           minimum_should_match: 1,
            //         },
            //       },
            //       track_total_hits: true,
            //     },
            //   });

            //   const items = res.items;
            //   console.log("items", items.length);
            //   //console.log(" item :>> ", JSON.stringify(items?.[0]));
            //   opStatus = items?.[0]?.intent_status;
            //   console.log("STATUS OPENSEARCH :>> ", opStatus);
            // } catch (error) {
            //   console.log("error :>> ", error);
            // }

            // Actualizar el status a completed
            if (opStatus === "fulfilled") {
              try {
                const updateParams = {
                  TableName: TABLE_NAME,
                  Key: {
                    pk: item.pk,
                  },
                  UpdateExpression:
                    "SET #status = :completed, #updated_at = :now",
                  ExpressionAttributeNames: {
                    "#status": "status",
                    "#updated_at": "updated_at",
                  },
                  ExpressionAttributeValues: {
                    ":completed": "completed",
                    ":now": new Date().toISOString(),
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
                console.log(
                  `🕐 Nuevo updated_at: ${result.Attributes.updated_at}`
                );

                successfulItems.push({
                  pk: item.pk,
                  sk: item.sk,
                  oldStatus: "pending",
                  newStatus: "completed",
                  updatedAt: result.Attributes.updated_at,
                  props: item.props,
                });
              } catch (updateError) {
                console.error(
                  `❌ Error actualizando item ${item.pk}:`,
                  updateError.message
                );
                await saveFailedItem(item, updateError, failedItems);
                failedCount++;
              }
            }
          } else {
            skippedCount++;
            console.log(`⏭️  Item omitido (status: ${item.status})`);
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
          `\n📊 Procesados ${totalCount} registros. Pending encontrados: ${pendingCount}. Actualizados: ${updatedCount}. Continuando con el siguiente lote...`
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
  console.log(`Total de items ACTUALIZADOS exitosamente: ${updatedCount}`);
  console.log(`Total de items OMITIDOS (no pending): ${skippedCount}`);
  console.log(`Total de items FALLIDOS: ${failedCount}`);
  console.log("========================================");

  // Guardar todos los items actualizados exitosamente
  await saveSuccessfulUpdates(successfulItems);

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
