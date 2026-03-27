import AWS from "aws-sdk";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenSearchClient } from "./opensearch-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.STM_PAYMENT_TABLE || "statement_payment_records";
const INDEX_NAME = "search_subsearch_index";
const STM_PAYMENT_INDEX_NAME =
  process.env.STM_PAYMENT_INDEX_NAME || "stm_payment_dev";
const UPDATE_BATCH_SIZE = 10;
const MONTH = process.argv[2];
if (!MONTH) {
  console.error("Usage: node stm-payment-add-source-prop.js <YYYY-MM>");
  process.exit(1);
}
const SEARCH_VALUE = `ORG|vana|MONTH|${MONTH}`;

const openSearchClient = new OpenSearchClient(process.env.OPENSEARCH_NODE, {
  username: process.env.OPENSEARCH_USERNAME,
  password: process.env.OPENSEARCH_PASSWORD,
});

console.log(TABLE_NAME);

const failedUpdates = [];

async function queryPayments() {
  let lastEvaluatedKey = undefined;
  let count = 0;

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: INDEX_NAME,
      KeyConditionExpression: "#search = :searchValue",
      FilterExpression: "#type = :typeValue",
      ExpressionAttributeNames: {
        "#search": "search",
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":searchValue": SEARCH_VALUE,
        ":typeValue": "PAYMENT",
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    try {
      const data = await dynamodb.query(params).promise();

      for (let i = 0; i < data.Items.length; i += UPDATE_BATCH_SIZE) {
        const batch = data.Items.slice(i, i + UPDATE_BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map((item) => {
            const intentId = item?.props?.intent_id;
            const source = item?.source?.split("|")?.[3] || "";
            return openSearchClient
              .updateDocument({
                index: STM_PAYMENT_INDEX_NAME,
                id: intentId,
                doc: { source },
              })
              .then(() => ({ intentId, source, ok: true }))
              .catch((err) => ({
                intentId,
                source,
                ok: false,
                error: err.message,
              }));
          }),
        );

        for (const r of results) {
          const { intentId, source, ok, error } = r.value;
          if (ok) {
            console.log(`intentId: ${intentId} | source: ${source} | updated`);
          } else {
            console.error(`intentId: ${intentId} | error: ${error}`);
            failedUpdates.push({ intentId, source, error });
          }
        }

        count += batch.length;
      }

      lastEvaluatedKey = data.LastEvaluatedKey;
    } catch (err) {
      console.error(`Error querying DynamoDB for ${SEARCH_VALUE}:`, err);
      break;
    }
  } while (lastEvaluatedKey);

  return count;
}

async function init() {
  console.log("Querying payments...");
  console.log(`Search: ${SEARCH_VALUE}`);
  console.log("----------------------------------------");

  const totalCount = await queryPayments();

  console.log("----------------------------------------");
  console.log(`Done. Total payments found: ${totalCount}`);
  console.log(`Failed updates: ${failedUpdates.length}`);

  if (failedUpdates.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const failsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(failsDir)) fs.mkdirSync(failsDir);

    const filePath = path.join(
      failsDir,
      `failed-payment-source-updates-${timestamp}.json`,
    );
    fs.writeFileSync(filePath, JSON.stringify(failedUpdates, null, 2));
    console.log(`Failed updates saved to: ${filePath}`);
  }
}

(async () => {
  try {
    await init();
  } catch (error) {
    console.error("Error:", error);
  }
})();
