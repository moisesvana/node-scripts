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
const tableName = "costumer_tickets_records";

const findParams = {
  TableName: tableName,
  IndexName: "type_sk_index",
  ExpressionAttributeNames: {
    "#type": "type",
    "#updated_at": "updated_at",
  },
  ExpressionAttributeValues: {
    ":type": "TICKET_CHECKPOINT|USER_INFORMATION",
    ":updated_at": "2024-07-04T18:05:54.650Z",
  },
  KeyConditionExpression: "#type = :type",
  FilterExpression: "#updated_at > :updated_at",
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

  result.forEach((item) => {
    if (item?.props?.open_ai) {
      console.log("item", item.sk);
      console.log(red("open_ai"), JSON.stringify(item.props.open_ai));
    }
  });

  console.log("result.l", result.length);
}

main().catch(console.error);
