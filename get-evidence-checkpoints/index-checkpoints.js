const AWS = require("aws-sdk");
const fs = require("fs");
const {
  color,
  log,
  red,
  green,
  cyan,
  cyanBright,
} = require("console-log-colors");

// Configura AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "us-east-1",
});

// AWS.config.update({
//   region: "localhost",
//   endpoint: "http://localhost:8000",
//   accessKeyId: "qinjwm",
//   secretAccessKey: "m6uds",
// });

const dynamodbClient = new AWS.DynamoDB.DocumentClient();
// 2024-07-03T00:18:18.633Z
const today = new Date();
today.setHours(0, 0, 0, 0); // Set to start of today
const isoToday = today.toISOString();
const tableName = "document_analysis_records";

const findParams = {
  TableName: tableName,
  IndexName: "country_index",
  ExpressionAttributeNames: {
    "#country": "country",
    "#created_at": "created_at",
  },
  ExpressionAttributeValues: {
    ":country": "gt",
    ":created_at": "2024-07-08T00:38:11.317Z",
  },
  KeyConditionExpression: "#country = :country",
  FilterExpression: "#created_at > :created_at",
};

async function main() {
  let result = [];
  let moreItems = true;
  while (moreItems) {
    moreItems = false;
    let foundItems = await dynamodbClient.query(findParams).promise();
    if (foundItems && foundItems.Items) {
      result = result.concat(foundItems.Items);
    }
    if (typeof foundItems.LastEvaluatedKey != "undefined") {
      moreItems = true;
      findParams["ExclusiveStartKey"] = foundItems.LastEvaluatedKey;
    }
  }

  let lastSk = "";
  let processedItems = 0;
  let emailContainsUsernameTotal = 0;
  for (let i = 0; i < result.length; i++) {
    let item = result[i];
    if (lastSk !== item.sk) {
      console.log("item", item.sk);
      processedItems++;
      if (item?.checkpoints?.emailContainsUsername)
        emailContainsUsernameTotal++;
    }
    lastSk = item.sk;
  }

  console.log("promedio", emailContainsUsernameTotal / processedItems);
  console.log("emailContainsUsernameTotal", emailContainsUsernameTotal);
  console.log("processedItems", processedItems);
  console.log("total", result.length);
}

main().catch(console.error);
