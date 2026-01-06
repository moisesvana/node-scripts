import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenSearchClient } from "./opensearch-client.js";

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenSearch configuration
const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const indexName = "costumer_tickets_payment";

const secrets = {
  username: username,
  password: password,
};

console.log("Initializing OpenSearch client...");
const openSearchClient = new OpenSearchClient(nodeName, secrets);

// Function to save results
async function saveResults(notFoundOrDifferentStatus) {
  const logsDir = path.join(__dirname, "logs");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `validated-missing-payments-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const resultData = {
    summary: {
      totalValidated: notFoundOrDifferentStatus.length,
      timestamp: new Date().toISOString(),
      indexName: indexName,
      operation: "validate missing payments against opensearch",
      description:
        "Payments that don't exist in OpenSearch or have ticket_status different from 'assigned'",
    },
    items: notFoundOrDifferentStatus,
  };

  try {
    await fs.promises.writeFile(filePath, JSON.stringify(resultData, null, 2));
    console.log(`\n📁 Results saved in: ${fileName}`);
    console.log(
      `📊 Total payments not found or with different status: ${notFoundOrDifferentStatus.length}`
    );
  } catch (writeError) {
    console.error(`❌ Error saving results file:`, writeError.message);
  }
}

async function validatePayments() {
  // Read missing-payments.json
  const missingPaymentsPath = path.join(
    __dirname,
    "logs",
    "missing-payments.json"
  );

  if (!fs.existsSync(missingPaymentsPath)) {
    console.error(`❌ File not found: ${missingPaymentsPath}`);
    process.exit(1);
  }

  const missingPaymentsData = JSON.parse(
    fs.readFileSync(missingPaymentsPath, "utf-8")
  );

  console.log(`\n📋 Total payments to validate: ${missingPaymentsData.length}`);
  console.log("========================================\n");

  const notFoundOrDifferentStatus = [];
  let processedCount = 0;
  let foundCount = 0;
  let notFoundCount = 0;
  let differentStatusCount = 0;

  for (const payment of missingPaymentsData) {
    processedCount++;
    const paymentId = payment.payment_id;

    console.log(
      `\n[${processedCount}/${missingPaymentsData.length}] Validating payment: ${paymentId}`
    );

    try {
      const searchQuery = {
        from: 0,
        size: 50,
        _source: ["pk", "sk", "props", "ticket_status"],
        query: {
          bool: {
            must: [
              {
                term: {
                  "pk.keyword": `TICKET_PAYMENT|${paymentId}`,
                },
              },
            ],
          },
        },
        sort: [
          {
            created_at: {
              order: "desc",
            },
          },
        ],
        track_total_hits: true,
      };

      const response = await openSearchClient.search({
        index: indexName,
        queryInput: searchQuery,
      });

      const items = response.items || [];
      const totalHits = response.total || 0;

      if (items.length === 0) {
        console.log(`   ❌ NOT FOUND in OpenSearch`);
        notFoundCount++;
        notFoundOrDifferentStatus.push({
          ...payment,
          validation_status: "not_found_in_opensearch",
          opensearch_result: null,
        });
      } else {
        const ticketStatus = items[0].ticket_status;
        console.log(
          `   ✅ Found in OpenSearch - ticket_status: "${ticketStatus}"`
        );
        foundCount++;

        if (ticketStatus !== "assigned") {
          console.log(`   ⚠️  Status is different from "assigned"`);
          differentStatusCount++;
          notFoundOrDifferentStatus.push({
            ...payment,
            validation_status: "different_ticket_status",
            opensearch_result: {
              ticket_status: ticketStatus,
              pk: items[0].pk,
              sk: items[0].sk,
              props: items[0].props,
            },
          });
        }
      }

      // Small delay to avoid overwhelming OpenSearch
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(
        `   ❌ Error validating payment ${paymentId}:`,
        error.message
      );
      notFoundOrDifferentStatus.push({
        ...payment,
        validation_status: "error",
        error: error.message,
        opensearch_result: null,
      });
    }
  }

  console.log("\n");
  console.log("========================================");
  console.log("🎯 VALIDATION SUMMARY");
  console.log("========================================");
  console.log(`Total payments validated: ${processedCount}`);
  console.log(`Found in OpenSearch: ${foundCount}`);
  console.log(`Not found in OpenSearch: ${notFoundCount}`);
  console.log(`Found with different status: ${differentStatusCount}`);
  console.log(
    `Total to save (not found + different status): ${notFoundOrDifferentStatus.length}`
  );
  console.log("========================================");

  // Save results
  await saveResults(notFoundOrDifferentStatus);
}

(async () => {
  try {
    await validatePayments();
    console.log("\n✅ Validation completed successfully");
  } catch (error) {
    console.error("❌ Error in validation process:", error);
    process.exit(1);
  }
})();
