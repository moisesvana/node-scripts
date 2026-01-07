import AWS from "aws-sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenSearchClient } from "./opensearch-client.js";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OpenSearch configuration
const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const ticketsIndexName = "costumer_tickets_payment";
const paymentsIndexName = "stm_payment";

// Date range configuration (can be overridden via environment variables)
const START_DATE = "2026-01-07T17:10:11.455Z";
const END_DATE = "2026-01-07T18:50:15.072Z";

const secrets = {
  username: username,
  password: password,
};

console.log("Initializing OpenSearch client...");
const openSearchClient = new OpenSearchClient(nodeName, secrets);

// Function to query stm_payment index by payment_id
async function queryStmPaymentByPaymentId(paymentId) {
  try {
    const searchQuery = {
      query: {
        bool: {
          should: [
            {
              term: {
                "remote_id.keyword": paymentId,
              },
            },
            {
              term: {
                "shadow_id.keyword": paymentId,
              },
            },
            {
              term: {
                "intent_id.keyword": paymentId,
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
      track_total_hits: true,
    };

    const response = await openSearchClient.search({
      index: paymentsIndexName,
      queryInput: searchQuery,
    });

    return response.items || [];
  } catch (error) {
    console.error(
      `❌ Error querying stm_payment for payment_id ${paymentId}:`,
      error.message
    );
    throw error;
  }
}

// Function to save results
async function saveResults(items, fulfilledPayments, dateRange) {
  const logsDir = path.join(__dirname, "logs");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = Date.now();

  // Save pending tickets with fulfilled payments
  if (fulfilledPayments.length > 0) {
    const fileName = `pending-tickets-fulfilled-${timestamp}.json`;
    const filePath = path.join(logsDir, fileName);

    const resultsData = {
      summary: {
        totalPendingWithFulfilled: fulfilledPayments.length,
        timestamp: new Date().toISOString(),
        ticketsIndex: ticketsIndexName,
        paymentsIndex: paymentsIndexName,
        ticketStatus: "pending",
        intentStatus: "fulfilled",
        dateRange: dateRange,
      },
      items: fulfilledPayments,
    };

    try {
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(resultsData, null, 2)
      );
      console.log(
        `📁 Pending tickets with fulfilled payments saved in: ${fileName}`
      );
      console.log(
        `📊 Total pending tickets with fulfilled payments: ${fulfilledPayments.length}`
      );
    } catch (writeError) {
      console.error(`❌ Error saving results file:`, writeError.message);
    }
  } else {
    console.log("✅ No pending tickets with fulfilled payments found");
  }

  // Save all pending tickets (for reference)
  if (items.length > 0) {
    const allFileName = `pending-tickets-all-${timestamp}.json`;
    const allFilePath = path.join(logsDir, allFileName);

    const allResultsData = {
      summary: {
        totalPending: items.length,
        timestamp: new Date().toISOString(),
        ticketsIndex: ticketsIndexName,
        ticketStatus: "pending",
        dateRange: dateRange,
      },
      items: items,
    };

    try {
      await fs.promises.writeFile(
        allFilePath,
        JSON.stringify(allResultsData, null, 2)
      );
      console.log(`📁 All pending tickets saved in: ${allFileName}`);
      console.log(`📊 Total pending tickets: ${items.length}`);
    } catch (writeError) {
      console.error(`❌ Error saving all tickets file:`, writeError.message);
    }
  }
}

// Function to save failed items
async function saveFailedItem(item, error, failedItems) {
  const failedData = {
    timestamp: new Date().toISOString(),
    error: error.message,
    errorStack: error.stack,
    item: item,
    pk: item?.pk,
    sk: item?.sk,
  };

  failedItems.push(failedData);
  console.log(`📝 Failed item added to list: ${item?.pk || "unknown"}`);
}

// Function to save all failed items
async function saveAllFailedItems(failedItems, dateRange) {
  if (failedItems.length === 0) {
    console.log("✅ No failed items to save");
    return;
  }

  const logsDir = path.join(__dirname, "logs");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const fileName = `failed-pending-tickets-${timestamp}.json`;
  const filePath = path.join(logsDir, fileName);

  const allFailedData = {
    summary: {
      totalFailed: failedItems.length,
      timestamp: new Date().toISOString(),
      ticketsIndex: ticketsIndexName,
      paymentsIndex: paymentsIndexName,
      operation: "read pending tickets and query stm_payment",
      dateRange: dateRange,
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
  let failedCount = 0;
  let fulfilledCount = 0;
  const failedItems = [];
  const pendingTickets = [];
  const fulfilledPayments = [];
  const pageSize = 50; // Match the size from your query
  let from = 0;
  let hasMore = true;

  const dateRange = {
    start: START_DATE,
    end: END_DATE,
  };

  console.log("Starting to read pending tickets from OpenSearch...");
  console.log(`Tickets Index: ${ticketsIndexName}`);
  console.log(`Payments Index: ${paymentsIndexName}`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
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
                term: {
                  ticket_status: "pending",
                },
              },
              {
                range: {
                  "props.created_at": {
                    gte: START_DATE,
                    lte: END_DATE,
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
        index: ticketsIndexName,
        queryInput: searchQuery,
      });

      const items = response.items || [];
      const totalHits = response.total || 0;

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
          console.log(`📋 Processing ticket ${totalCount}`);
          console.log(`PK: ${item.pk}`);
          console.log(`SK: ${item.sk}`);
          console.log(`Ticket Status: ${item.ticket_status}`);
          console.log(
            `Created At: ${item.props?.created_at || "Not available"}`
          );

          // Extract payment_id from pk (format: PAYMENT|payment_id|...)
          const paymentId = item.pk.split("|")[1];
          console.log(`Payment ID: ${paymentId}`);

          // Add to pending tickets list
          pendingTickets.push(item);

          // Query stm_payment index
          console.log(`🔎 Querying stm_payment for payment_id: ${paymentId}`);
          const paymentRecords = await queryStmPaymentByPaymentId(paymentId);

          if (paymentRecords.length > 0) {
            console.log(
              `📦 Found ${paymentRecords.length} payment record(s) in stm_payment`
            );

            // Filter only fulfilled intent_status
            const fulfilledRecords = paymentRecords.filter(
              (payment) => payment.intent_status === "fulfilled"
            );

            if (fulfilledRecords.length > 0) {
              console.log(
                `✅ Found ${fulfilledRecords.length} FULFILLED payment(s)`
              );
              fulfilledRecords.forEach((payment) => {
                console.log(`   - Intent ID: ${payment.intent_id}`);
                console.log(`   - Intent Status: ${payment.intent_status}`);
                console.log(`   - Amount: ${payment.amount}`);
                console.log(`   - Country: ${payment.country}`);
              });

              // Add to fulfilled payments list with ticket info
              fulfilledPayments.push({
                ticket: item,
                payments: fulfilledRecords,
              });
              fulfilledCount++;
            } else {
              console.log(
                `ℹ️  Payment records found but none are fulfilled. Statuses: ${paymentRecords
                  .map((p) => p.intent_status)
                  .join(", ")}`
              );
            }
          } else {
            console.log(
              `⚠️  No payment records found in stm_payment for payment_id: ${paymentId}`
            );
          }

          // Small delay to avoid overwhelming the system
          await new Promise((resolve) => setTimeout(resolve, 200));
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
        `\n📊 Progress: Processed ${totalCount} tickets. Fulfilled: ${fulfilledCount}. Failed: ${failedCount}`
      );
    } catch (searchError) {
      console.error(
        `❌ Error querying OpenSearch at offset ${from}:`,
        searchError.message
      );
      console.error("Error details:", searchError);

      // Save the error but stop pagination
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
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log(`Total tickets processed: ${totalCount}`);
  console.log(`Total pending tickets: ${pendingTickets.length}`);
  console.log(`Pending tickets with FULFILLED payments: ${fulfilledCount}`);
  console.log(`Failed items: ${failedCount}`);
  console.log("========================================");

  // Save all results
  await saveResults(pendingTickets, fulfilledPayments, dateRange);

  // Save all failed items
  await saveAllFailedItems(failedItems, dateRange);
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
