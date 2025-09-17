const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Función para guardar tickets fallidos
async function saveFailed(
  originalTicket,
  newTicketItem,
  error,
  ticketId,
  failedTickets
) {
  const failedData = {
    timestamp: new Date().toISOString(),
    error: error.message,
    originalTicket: originalTicket,
    newTicketItem: newTicketItem,
    ticketId: ticketId,
  };

  failedTickets.push(failedData);
  console.log(`📝 Ticket fallido agregado a la lista: ${ticketId}`);
}

// Función para guardar todos los tickets fallidos en un solo archivo
async function saveAllFailed(failedTickets) {
  if (failedTickets.length === 0) {
    console.log("✅ No hay tickets fallidos para guardar");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `all-failed-${TYPE_VALUE.toLowerCase()}-${timestamp}.json`;
  const filePath = path.join(__dirname, "fails", fileName);

  const allFailedData = {
    summary: {
      totalFailed: failedTickets.length,
      timestamp: new Date().toISOString(),
      tableName: TABLE_NAME,
      typeValue: TYPE_VALUE,
      newEntityType: NEW_ENTITY_TYPE,
    },
    failedTickets: failedTickets,
  };

  try {
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(allFailedData, null, 2)
    );
    console.log(`📁 Todos los tickets fallidos guardados en: ${fileName}`);
    console.log(`📊 Total de tickets fallidos: ${failedTickets.length}`);
  } catch (writeError) {
    console.error(
      `❌ Error guardando archivo de tickets fallidos:`,
      writeError.message
    );
  }
}

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME || "costumer_tickets_records_dev";
const TYPE_INDEX = process.env.TYPE_INDEX || "type_sk_index";
const TYPE_VALUE = "TICKET_CHECKPOINT|USER_INFORMATION";
const NEW_ENTITY_TYPE = "TICKET_VERIFICATION";

// Configura aquí el rango de fechas que deseas consultar
const START_DATE = process.env.START_DATE || "";
const END_DATE = process.env.END_DATE || "";

console.log("START_DATE :>> ", START_DATE);
console.log("END_DATE :>> ", END_DATE);

async function init() {
  let lastEvaluatedKey = undefined;
  let count = 0;
  let failedCount = 0;
  const failedTickets = [];
  const batchSize = Number(process.env.BATCH_SIZE) || 500;

  console.log("Iniciando consulta...");
  console.log(`Rango de fechas: ${START_DATE} hasta ${END_DATE}`);
  console.log("----------------------------------------");

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: TYPE_INDEX,
      KeyConditionExpression: "#type = :typeValue",
      FilterExpression: "#updated_at BETWEEN :startDate AND :endDate",
      ExpressionAttributeNames: {
        "#type": "type",
        "#updated_at": "updated_at",
      },
      ExpressionAttributeValues: {
        ":typeValue": TYPE_VALUE,
        ":startDate": START_DATE,
        ":endDate": END_DATE,
      },
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: batchSize,
    };

    try {
      const data = await dynamodb.query(params).promise();

      for (const item of data.Items) {
        if (item.sk.includes(NEW_ENTITY_TYPE)) continue;
        console.log("\n");
        console.log("----------------------------------------");
        console.log(`PK: ${item.pk}`);
        console.log(`SK: ${item.sk}`);

        const newItem = {
          ...item,
          sk: `TICKET_EVIDENCE|${item.sk.split("|")[1]}`,
        };

        console.log("\n");
        console.log(
          "newItem",
          JSON.stringify({ sk: newItem.sk, pk: newItem.pk })
        );
        console.log("\n");

        // Execute update: update existing record with new data
        try {
          const updateParams = {
            TableName: TABLE_NAME,
            Key: {
              pk: item.pk,
            },
            UpdateExpression: "SET #sk = :newSk",
            ExpressionAttributeNames: {
              "#sk": "sk",
            },
            ExpressionAttributeValues: {
              ":newSk": newItem.sk,
            },
          };

          await dynamodb.update(updateParams).promise();
          console.log(
            `✅ Actualización exitosa: ${item.pk} → SK actualizado a ${newItem.sk}`
          );
        } catch (error) {
          console.error(
            `❌ Error en actualización para ${item.pk}:`,
            error.message
          );

          // Guardar ticket fallido en el folder fails
          await saveFailed(item, newItem, error, item.pk, failedTickets);
          failedCount++;
        }

        console.log(`Updated At: ${item.updated_at}`);
        console.log("----------------------------------------");
        console.log("\n");
        count++;
      }

      lastEvaluatedKey = data.LastEvaluatedKey;

      if (lastEvaluatedKey) {
        console.log(
          `Procesados ${count} registros. Continuando con el siguiente lote...`
        );
        // wait 500ms
        //await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error("Error consultando DynamoDB:", err);
      break;
    }
  } while (lastEvaluatedKey);

  console.log(`\nProceso completado. Total de registros procesados: ${count}`);
  console.log(`Total fallidos: ${failedCount}`);

  // Guardar todos los tickets fallidos en un solo archivo
  await saveAllFailed(failedTickets);
}

(async () => {
  try {
    await init();
  } catch (error) {
    console.error("Error en el proceso principal:", error);
  }
})();
