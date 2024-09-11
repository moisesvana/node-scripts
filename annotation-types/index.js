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

async function createJSON() {
  const foundItems = await dynamodbClient
    .scan({
      TableName: "collection_annotation_type_dev",
    })
    .promise();

  foundItems?.Items.forEach((item) => {
    log(cyanBright(item.id));
  });
  const json = JSON.stringify(foundItems.Items || []);
  fs.writeFileSync("annotation-types.json", json);
}

async function updateAnnotations() {
  const table = "collection_annotation_type_qa";
  const foundItems = await dynamodbClient
    .scan({
      TableName: table,
    })
    .promise();
  const jsonMetadataToUpdate = fs.readFileSync("annotation-types.json");
  const jsonMetadata = JSON.parse(jsonMetadataToUpdate);
  const items = foundItems?.Items || [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    log(` ${i} - updating: ` + cyanBright(item.id));

    const itemToUpdate = jsonMetadata.find((i) => i.id === item.id);
    const newItem = {
      ...item,
      ...itemToUpdate,
    };

    if (newItem?.metadata) {
      const newI = await dynamodbClient
        .update({
          ExpressionAttributeNames: {
            "#metadata": "metadata",
          },
          ExpressionAttributeValues: {
            ":metadata": newItem.metadata,
          },
          Key: {
            id: item.id,
          },
          ReturnValues: "ALL_NEW",
          TableName: table,
          UpdateExpression: "SET #metadata = :metadata",
        })
        .promise();
      console.log("newItem :>> ", JSON.stringify(newI));
    }

    log(`${i} - updating: ` + cyanBright(item.id));
  }
}

// createJSON();
updateAnnotations();
