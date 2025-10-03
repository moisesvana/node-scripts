import AWS from "aws-sdk";
import { OpenSearchClient } from "./opensearch-client.js";
import fs from "fs";

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const nodeName = process.env.OPENSEARCH_NODE;
const username = process.env.OPENSEARCH_USERNAME;
const password = process.env.OPENSEARCH_PASSWORD;
const indexName = process.env.OPENSEARCH_INDEX_NAME || "stm_payment_dev";
const tableName = process.env.STM_PAYMENT_TABLE;

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
              "intent_status.keyword": ["processing"],
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

  for (const item of items) {
    const pk = `ORG|vana|PINTENT|${item.intent_id}`;
    const sk = `ORG|vana|IDENT|${item.loan_id}`;

    console.log("DynamoDB PK:", pk);
    console.log("DynamoDB SK:", sk);

    const params = {
      TableName: tableName,
      Key: {
        pk: pk,
        sk: sk,
      },
    };

    try {
      const result = await dynamodb.get(params).promise();
      if (result.Item) {
        console.log("DynamoDB record:", result.Item.status);
      } else {
        console.log("No record found for pk:", pk);
        notFound.push({
          intent_id: item.intent_id,
          status: item.intent_status,
          loan_id: item.loan_id,
        });
      }
    } catch (err) {
      console.error("Error getting record from DynamoDB:", err);
    }
  }

  if (notFound.length > 0) {
    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs");
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `logs/not-found-${timestamp}.json`;
    fs.writeFileSync(fileName, JSON.stringify(notFound, null, 2));
    console.log(`\nNot found records saved to ${fileName}. Total: ${notFound.length}`);
  }
}

try {
  await init();
} catch (err) {
  console.error(err);
}
