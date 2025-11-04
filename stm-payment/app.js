import AWS from "aws-sdk";
import fs from "fs";
import { OpenSearchClient } from "./opensearch-client.js";

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const indexName = process.env.OPENSEARCH_INDEX_NAME || "stm_payment_dev";
const stmPaymentTableName = process.env.STM_PAYMENT_TABLE;

const secrets = {
  username: username,
  password: password,
};

const openSearchClient = new OpenSearchClient(nodeName, secrets);

async function init() {
  const query = {
    from: 0,
    size: 10000,
    _source: ["intent_id", "intent_status", "intent_created_at", "loan_id"],
    query: {
      bool: {
        must: [
          {
            terms: {
              "intent_status.keyword": ["processing", "test"],
            },
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
          {
            match_all: {},
          },
        ],
      },
    },
    script_fields: {
      status: {
        script: {
          source:
            "if (params['_source']['intent_status'] == 'fulfilled') return 'approved'; else return params['_source']['intent_status'];",
        },
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
  const res = await openSearchClient.search({
    index: indexName,
    queryInput: query,
  });
  const items = res.items;
  console.log("items", items.length);

  const notFound = [];
  const updated = [];
  let updatedCount = 0;

  for (const item of items) {
    const pk = `ORG|vana|PINTENT|${item.intent_id}`;
    const sk = `ORG|vana|IDENT|${item.loan_id}`;

    console.log("DynamoDB PK:", pk);
    console.log("DynamoDB SK:", sk);

    const params = {
      TableName: stmPaymentTableName,
      Key: {
        pk: pk,
        sk: sk,
      },
    };

    try {
      const dynamoItem = await dynamodb.get(params).promise();
      if (dynamoItem.Item) {
        const dynamoStatus = dynamoItem.Item.status;
        if (dynamoStatus === item.intent_status) {
          console.log("Status matches, no action needed.");
        } else {
          console.log(`${pk} : DynamoDB record found, updating updated_at...`);

          //const currentUpdatedAt = dynamoItem.Item.updated_at;
          // const newUpdatedAt = new Date(
          //   new Date(currentUpdatedAt).getTime() + 1000
          // ).toISOString();

          // const updateParams = {
          //   TableName: stmPaymentTableName,
          //   Key: {
          //     pk: pk,
          //     sk: sk,
          //   },
          //   UpdateExpression: "SET #updated_at = :updated_at",
          //   ExpressionAttributeNames: {
          //     "#updated_at": "updated_at",
          //   },
          //   ExpressionAttributeValues: {
          //     ":updated_at": newUpdatedAt,
          //   },
          // };

          //await dynamodb.update(updateParams).promise();
          const updateResult = await openSearchClient.updateIntentStatus({
            index: indexName,
            id: item.intent_id,
            intentStatus: dynamoStatus,
          });
          updatedCount++;
          console.log(
            `Updated intent_status for ${item.intent_id} - Result: ${updateResult.result}`
          );

          updated.push({
            intent_id: item.intent_id,
            loan_id: item.loan_id,
            pk: pk,
            sk: sk,
            old_status: item.intent_status,
            new_status: dynamoStatus,
            intent_created_at: item.intent_created_at,
            update_result: updateResult.result,
          });
        }
      } else {
        console.log("No record found for pk:", pk);
        notFound.push({
          intent_id: item.intent_id,
          status: item.intent_status,
          loan_id: item.loan_id,
          intent_created_at: item.intent_created_at,
        });

        // Delete document from OpenSearch
        try {
          const deleteResult = await openSearchClient.deleteDocument({
            index: indexName,
            id: item.intent_id,
          });
          console.log(
            `Deleted from OpenSearch: ${item.intent_id} - Result: ${deleteResult.result}`
          );
        } catch (deleteErr) {
          console.error(
            `Error deleting from OpenSearch (${item.intent_id}):`,
            deleteErr.message
          );
        }
      }
      console.log("--------------------------------------------------");
      console.log("\n");
    } catch (err) {
      console.error("Error getting record from DynamoDB:", err);
    }
  }

  console.log(`\nTotal records updated: ${updatedCount}`);

  if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (updated.length > 0) {
    const updatedFileName = `logs/updated-${timestamp}.json`;
    fs.writeFileSync(updatedFileName, JSON.stringify(updated, null, 2));
    console.log(
      `\nUpdated records saved to ${updatedFileName}. Total: ${updated.length}`
    );
  }

  if (notFound.length > 0) {
    const notFoundFileName = `logs/not-found-${timestamp}.json`;
    fs.writeFileSync(notFoundFileName, JSON.stringify(notFound, null, 2));
    console.log(
      `\nNot found records saved to ${notFoundFileName}. Total: ${notFound.length}`
    );
  }
}

try {
  await init();
} catch (err) {
  console.error(err);
}
