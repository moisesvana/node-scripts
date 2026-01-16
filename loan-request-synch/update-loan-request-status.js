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

AWS.config.update({ region: "us-east-1" });
const dynamodb = new AWS.DynamoDB.DocumentClient();
const DYNAMO_TABLE_NAME = "loan_request_state";

// OpenSearch configuration
const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const indexName = "loan_request_index";

const secrets = {
  username: username,
  password: password,
};

console.log("Initializing OpenSearch client...");
const openSearchClient = new OpenSearchClient(nodeName, secrets);

async function saveFailedItems(failedItems) {
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
  const fileName = `failed-loan-request-updates-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const failedData = {
    summary: {
      totalFailed: failedItems.length,
      timestamp: new Date().toISOString(),
      indexName: indexName,
      operation: "update loan request status",
    },
    failedItems: failedItems,
  };

  try {
    await fs.promises.writeFile(filePath, JSON.stringify(failedData, null, 2));
    console.log(`📁 Failed items saved in: ${fileName}`);
    console.log(`📊 Total failed items: ${failedItems.length}`);
  } catch (writeError) {
    console.error(`❌ Error saving failed items file:`, writeError.message);
  }
}

async function getLoanRequestStateFromDynamo(loanRequestId) {
  const params = {
    TableName: DYNAMO_TABLE_NAME,
    Key: {
      loan_request_id: loanRequestId,
    },
  };

  const result = await dynamodb.get(params).promise();
  return result.Item || null;
}

async function init() {
  let totalCount = 0;
  let mismatchCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const failedItems = [];
  const pageSize = 500;
  let from = 0;
  let hasMore = true;

  // Calculate date range: last 25 hours from now
  const now = new Date();
  const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

  console.log("Starting to read loan requests from OpenSearch...");
  console.log(`Index: ${indexName}`);
  console.log(
    `Date range: ${twentyFiveHoursAgo.toISOString()} to ${now.toISOString()}`
  );
  console.log("Filter: state.status = 'created'");
  console.log("----------------------------------------");

  while (hasMore) {
    try {
      const searchQuery = {
        from: from,
        size: pageSize,
        query: {
          bool: {
            must: [
              {
                term: {
                  "state.status.keyword": {
                    value: "created",
                  },
                },
              },
              {
                range: {
                  created_at: {
                    gte: twentyFiveHoursAgo.toISOString(),
                    lte: now.toISOString(),
                  },
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

        const openSearchStatus = item.state?.status;
        const loanRequestId = item.loan_request_id;

        // Get DynamoDB record for the loan request state
        const dynamoItem = await getLoanRequestStateFromDynamo(loanRequestId);

        if (!dynamoItem) {
          console.log(
            `\n⚠️ No DynamoDB record found for Loan Request ID: ${loanRequestId}`
          );
          continue;
        }

        // Check for status mismatch
        const dynamoStatus = dynamoItem.status;

        if (dynamoStatus !== openSearchStatus) {
          mismatchCount++;
          console.log("\n🔴 ========== STATUS MISMATCH FOUND ==========");
          console.log(`Loan Request ID: ${loanRequestId}`);
          console.log(`User ID: ${item.user_id}`);
          console.log(`Country: ${item.country}`);
          console.log(`OpenSearch Status: ${openSearchStatus}`);
          console.log(`DynamoDB Status: ${dynamoStatus}`);
          console.log(`Created At: ${item.created_at}`);

          // Update OpenSearch with DynamoDB status (atomic update of state.status only)
          try {
            const updateResult = await openSearchClient.updateStateStatus({
              index: indexName,
              id: loanRequestId,
              status: dynamoStatus,
            });

            if (updateResult.success) {
              updatedCount++;
              console.log(
                `✅ OpenSearch updated successfully: state.status = "${dynamoStatus}"`
              );
            } else {
              failedCount++;
              failedItems.push({
                loan_request_id: loanRequestId,
                user_id: item.user_id,
                country: item.country,
                openSearchStatus: openSearchStatus,
                dynamoStatus: dynamoStatus,
                created_at: item.created_at,
                error: updateResult.result,
                timestamp: new Date().toISOString(),
              });
              console.log(
                `❌ Failed to update OpenSearch: ${updateResult.result}`
              );
            }
          } catch (updateError) {
            failedCount++;
            failedItems.push({
              loan_request_id: loanRequestId,
              user_id: item.user_id,
              country: item.country,
              openSearchStatus: openSearchStatus,
              dynamoStatus: dynamoStatus,
              created_at: item.created_at,
              error: updateError.message,
              errorStack: updateError.stack,
              timestamp: new Date().toISOString(),
            });
            console.error(
              `❌ Error updating OpenSearch: ${updateError.message}`
            );
          }

          console.log("==============================================");
        }
      }

      // Update pagination
      from += pageSize;

      // Check if we've reached the end
      if (from >= totalHits || items.length < pageSize) {
        hasMore = false;
      }

      console.log(`\n📊 Progress: Processed ${totalCount} items so far`);
    } catch (searchError) {
      console.error(
        `❌ Error querying OpenSearch at offset ${from}:`,
        searchError.message
      );
      console.error("Error details:", searchError);

      // Stop pagination on query errors
      hasMore = false;
    }
  }

  console.log("\n");
  console.log("========================================");
  console.log("🎯 PROCESS SUMMARY");
  console.log("========================================");
  console.log(`Total loan requests processed: ${totalCount}`);
  console.log(`Status mismatches found: ${mismatchCount}`);
  console.log(`Successfully updated in OpenSearch: ${updatedCount}`);
  console.log(`Failed to update: ${failedCount}`);
  console.log("========================================");

  // Save failed items to log file
  await saveFailedItems(failedItems);
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
