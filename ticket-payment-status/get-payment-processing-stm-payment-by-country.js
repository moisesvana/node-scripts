import AWS from "aws-sdk";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenSearchClient } from "./opensearch-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME || "costumer_tickets_records_dev";

const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const lmsToken = process.env.LMS_TOKEN;
const indexName = "stm_payment";
const LMS_API_URL = "https://api.vanalms.com/v1/payment/";

const openSearchClient = new OpenSearchClient(nodeName, {
  username,
  password,
});

async function getTicketStatus(paymentId, loanId) {
  const { data: response } = await axios.get(LMS_API_URL, {
    params: { payment_id: paymentId, loan_id: loanId },
    headers: { Authorization: `Bearer ${lmsToken}` },
  });
  return response?.data?.status ?? null;
}

const countryArg = process.argv.find((arg) => arg.startsWith("--country="));
const COUNTRY = countryArg ? countryArg.split("=")[1] : "HN";
console.log("******************** SET COUNTRY ******************** ", COUNTRY);

async function init() {
  let totalCount = 0;
  let notInDynamoCount = 0;
  let from = 0;
  const pageSize = 100;
  let hasMore = true;
  const failedUpdates = [];

  console.log("Starting to read processing stm_payments from OpenSearch...");
  console.log(`Index: ${indexName}`);
  console.log("----------------------------------------");

  while (hasMore) {
    const searchQuery = {
      from,
      size: pageSize,
      _source: [
        "intent_id",
        "shadow_id",
        "intent_status",
        "loan_id",
        "remote_id",
        "country",
      ],
      query: {
        bool: {
          must: [
            {
              terms: {
                "intent_status.keyword": ["processing"],
              },
            },
            {
              terms: {
                "country.keyword": [COUNTRY],
              },
            },
          ],
        },
      },
      sort: [
        {
          intent_created_at: {
            order: "asc",
          },
        },
      ],
      track_total_hits: true,
    };

    console.log(`\n🔍 Fetching page starting from offset ${from}...`);

    const response = await openSearchClient.search({
      index: indexName,
      queryInput: searchQuery,
    });

    const items = response.items || [];
    const totalHits = response.total || 0;

    console.log(`📊 Total hits: ${totalHits}`);
    console.log(`📄 Items in current page: ${items.length}`);

    if (items.length === 0) {
      hasMore = false;
      break;
    }

    const paymentStatusMapStmPayment = {
      approved: "fulfilled",
      processing: "processing",
      rejected: "rejected",
    };
    for (const item of items) {
      totalCount++;
      const paymentId = item?.shadow_id || item?.remote_id;
      const loanId = item?.loan_id || null;
      console.log("\n----------------------------------------");
      console.log(`intent_id: ${item.intent_id}`);
      console.log(`intent_status: ${item.intent_status}`);
      console.log("loan_id", loanId);
      console.log(`shadow_id:     ${item.shadow_id}`);
      console.log(`remote_id:     ${item.remote_id}`);
      console.log(`Payment ID:    ${paymentId}`);

      const dynamoResult = await dynamodb
        .get({
          TableName: TABLE_NAME,
          Key: { pk: `TICKET_PAYMENT|${paymentId}` },
        })
        .promise();

      const ticketStatus = dynamoResult.Item?.status || null;
      console.log("ticket_status", ticketStatus);
      if (!ticketStatus) notInDynamoCount++;

      try {
        const lmsStatus = await getTicketStatus(paymentId, loanId);
        console.log(`lms_status:    ${lmsStatus}`);

        const newIntentStatus = paymentStatusMapStmPayment[lmsStatus];
        if (
          newIntentStatus &&
          lmsStatus !== paymentStatusMapStmPayment.processing
        ) {
          console.log(
            `⚠️  MISMATCH — stm_payment: "${item.intent_status}" | LMS: "${lmsStatus}" → updating to "${newIntentStatus}"`,
          );
          try {
            await openSearchClient.updateIntentStatus({
              index: indexName,
              id: item.intent_id,
              intentStatus: newIntentStatus,
            });
            console.log(`✅ Updated intent_status to "${newIntentStatus}"`);
          } catch (updateErr) {
            console.error(
              `❌ Update failed for ${item.intent_id}: ${updateErr.message}`,
            );
            failedUpdates.push({
              timestamp: new Date().toISOString(),
              intent_id: item.intent_id,
              shadow_id: item.shadow_id,
              loan_id: loanId,
              stm_intent_status: item.intent_status,
              lms_status: lmsStatus,
              new_intent_status: newIntentStatus,
              error: updateErr.message,
            });
          }
        }
      } catch (err) {
        console.error(`❌ Error calling LMS for ${paymentId}: ${err.message}`);
      }
    }

    from += pageSize;
    if (from >= totalHits || items.length < pageSize) {
      hasMore = false;
    }
  }

  console.log("\n========================================");
  console.log("🎯 SUMMARY");
  console.log("========================================");
  console.log(`Total processing payments (${COUNTRY}): ${totalCount}`);
  console.log(`Not found in DynamoDB: ${notInDynamoCount}`);
  console.log(`Failed updates: ${failedUpdates.length}`);
  console.log("========================================");

  if (failedUpdates.length > 0) {
    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const fileName = `failed-updates-stm-payment-${Date.now()}.json`;
    await fs.promises.writeFile(
      path.join(logsDir, fileName),
      JSON.stringify(
        { total: failedUpdates.length, items: failedUpdates },
        null,
        2,
      ),
    );
    console.log(`📁 Failed updates saved to logs/${fileName}`);
  }
}

(async () => {
  try {
    await init();
    console.log("\n✅ Script completed successfully");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
})();
