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
const STM_STATEMENT_INDEX_NAME =
  process.env.STM_STATEMENT_INDEX_NAME || "stm_statement_dev";
const UPDATE_BATCH_SIZE = 10;
const SWIFT_CODE = process.argv[2];
if (!SWIFT_CODE) {
  console.error("Usage: node stm-statement-add-source-prop.js <SWIFT_CODE>");
  process.exit(1);
}

const openSearchClient = new OpenSearchClient(process.env.OPENSEARCH_NODE, {
  username: process.env.OPENSEARCH_USERNAME,
  password: process.env.OPENSEARCH_PASSWORD,
});

console.log(TABLE_NAME);

const failedUpdates = [];

async function queryByDate(searchValue) {
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
        ":searchValue": searchValue,
        ":typeValue": "STATEMENT",
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    try {
      const data = await dynamodb.query(params).promise();

      for (let i = 0; i < data.Items.length; i += UPDATE_BATCH_SIZE) {
        const batch = data.Items.slice(i, i + UPDATE_BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map((item) => {
            const statementId = item.shown_id;
            const source = item?.source?.split("|")?.[3] || "";
            return openSearchClient
              .updateDocument({
                index: STM_STATEMENT_INDEX_NAME,
                id: statementId,
                doc: { source },
              })
              .then(() => ({ statementId, source, ok: true }))
              .catch((err) => ({
                statementId,
                source,
                ok: false,
                error: err.message,
              }));
          }),
        );

        for (const r of results) {
          const { statementId, source, ok, error } = r.value;
          if (ok) {
            console.log(
              `statementId: ${statementId} | source: ${source} | updated`,
            );
          } else {
            console.error(`statementId: ${statementId} | error: ${error}`);
            failedUpdates.push({ statementId, source, error });
          }
        }

        count += batch.length;
      }

      lastEvaluatedKey = data.LastEvaluatedKey;
    } catch (err) {
      console.error(`Error querying DynamoDB for ${searchValue}:`, err);
      break;
    }
  } while (lastEvaluatedKey);

  return count;
}

async function init() {
  let totalCount = 0;

  console.log("Querying statements...");
  console.log("----------------------------------------");

  for (let day = 1; day <= 31; day++) {
    const date = `2026-01-${String(day).padStart(2, "0")}`;
    const searchValue = `ORG|vana|BANK|${SWIFT_CODE}|DATE|${date}`;
    console.log(`\nSearching: ${searchValue}`);

    const count = await queryByDate(searchValue);
    totalCount += count;

    console.log(`Date ${date}: ${count} statements found`);
  }

  console.log("----------------------------------------");
  console.log(`Done. Total statements found: ${totalCount}`);
  console.log(`Failed updates: ${failedUpdates.length}`);

  if (failedUpdates.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const failsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(failsDir)) fs.mkdirSync(failsDir);

    const filePath = path.join(
      failsDir,
      `failed-source-updates-${timestamp}.json`,
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
