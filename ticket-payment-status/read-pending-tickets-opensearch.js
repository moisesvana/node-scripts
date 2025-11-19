import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenSearchClient } from "./opensearch-client.js";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME || "costumer_tickets_records_dev";

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

// Function to save failed items
async function saveFailedItem(item, error, failedItems) {
  const failedData = {
    timestamp: new Date().toISOString(),
    error: error.message,
    errorStack: error.stack,
    item: item,
    pk: item.pk,
    sk: item.sk,
  };

  failedItems.push(failedData);
  console.log(`📝 Failed item added to list: ${item.pk}`);
}

// Function to save all failed items
async function saveAllFailedItems(failedItems) {
  if (failedItems.length === 0) {
    console.log("✅ No failed items to save");
    return;
  }

  const logsDir = path.join(__dirname, "logs");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `failed-opensearch-reads-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const allFailedData = {
    summary: {
      totalFailed: failedItems.length,
      timestamp: new Date().toISOString(),
      indexName: indexName,
      operation: "read pending tickets from opensearch",
    },
    failedItems: failedItems,
  };

  try {
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(allFailedData, null, 2)
    );
    console.log(`📁 All failed items saved in: ${fileName}`);
    console.log(`📊 Total failed items: ${failedItems.length}`);
  } catch (writeError) {
    console.error(`❌ Error saving failed items file:`, writeError.message);
  }
}

async function init() {
  let totalCount = 0;
  let successCount = 0;
  let failedCount = 0;
  const failedItems = [];
  const pageSize = 800;
  let from = 0;
  let hasMore = true;

  console.log("Starting to read pending tickets from OpenSearch...");
  console.log(`Index: ${indexName}`);
  console.log("----------------------------------------");

  while (hasMore) {
    try {
      const searchQuery = {
        from: from,
        size: pageSize,
        _source: ["pk", "sk", "props", "ticket_status"],
        query: {
          bool: {
            must: [
              {
                terms: {
                  "ticket_status.keyword": ["pending"],
                },
              },
              {
                term: {
                  "props.queue.keyword": "review",
                },
              },
            ],
          },
        },
        sort: [
          {
            _script: {
              type: "number",
              script: {
                source: `
                  def ts;
                  if (doc.containsKey('props.created_at') && !doc['props.created_at'].empty) {
                    ts = doc['props.created_at'].value.toInstant().toEpochMilli();
                  } else if (doc.containsKey('created_at') && !doc['created_at'].empty) {
                    ts = doc['created_at'].value.toInstant().toEpochMilli();
                  } else {
                    ts = 0;
                  }
                  return ts;
                `,
              },
              order: "ASC",
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
      const totalHits = response.total?.value || 0;

      console.log(`📊 Total hits in index: ${totalHits}`);
      console.log(`📄 Items in current page: ${items.length}`);

      if (items.length === 0) {
        hasMore = false;
        console.log("✅ No more items to process");
        break;
      }

      // Process each item
      for (const item of items) {
        totalCount++;

        try {
          console.log("\n----------------------------------------");
          console.log(`📋 Processing item ${totalCount}`);
          console.log(`PK: ${item.pk}`);
          console.log(`SK: ${item.sk}`);
          const paymentId = item.pk.split("|")[1];
          console.log(`Payment ID: ${paymentId}`);

          // Update DynamoDB - updated_at field
          try {
            const updateParams = {
              TableName: TABLE_NAME,
              Key: {
                pk: item.pk,
                //sk: item.sk,
              },
              UpdateExpression: "SET #updated_at = :now",
              ExpressionAttributeNames: {
                "#updated_at": "updated_at",
              },
              ExpressionAttributeValues: {
                ":now": new Date().toISOString(),
              },
              ReturnValues: "ALL_NEW",
            };

            const result = await dynamodb.update(updateParams).promise();
            console.log(
              `🎉 Updated_at field updated successfully: ${result.Attributes.updated_at}`
            );

            successCount++;
            console.log("✅ Item processed successfully");
          } catch (updateError) {
            console.error(
              `❌ Error updating DynamoDB for item ${item.pk}:`,
              updateError.message
            );
            await saveFailedItem(item, updateError, failedItems);
            failedCount++;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (itemError) {
          console.error(
            `❌ Error processing item ${item.pk}:`,
            itemError.message
          );
          await saveFailedItem(item, itemError, failedItems);
          failedCount++;
        }
      }

      // Update pagination
      from += pageSize;

      // Check if we've reached the end
      if (from >= totalHits || items.length < pageSize) {
        hasMore = false;
      }

      console.log(
        `\n📊 Progress: Processed ${totalCount} items. Success: ${successCount}. Failed: ${failedCount}`
      );
    } catch (searchError) {
      console.error(
        `❌ Error querying OpenSearch at offset ${from}:`,
        searchError.message
      );
      console.error("Error details:", searchError);

      // Save the error but continue if possible
      failedItems.push({
        timestamp: new Date().toISOString(),
        error: searchError.message,
        errorStack: searchError.stack,
        context: {
          operation: "OpenSearch query",
          offset: from,
          pageSize: pageSize,
        },
      });
      failedCount++;

      // Stop pagination on query errors
      hasMore = false;
    }
  }

  console.log("\n");
  console.log("========================================");
  console.log("🎯 PROCESS SUMMARY");
  console.log("========================================");
  console.log(`Total items processed: ${totalCount}`);
  console.log(`Successfully processed: ${successCount}`);
  console.log(`Failed items: ${failedCount}`);
  console.log("========================================");

  // Save all failed items
  await saveAllFailedItems(failedItems);
}

(async () => {
  try {
    await init();
    console.log("\n✅ Script completed successfully");
  } catch (error) {
    console.error("❌ Error in main process:", error);
    process.exit(1);
  }
})();
