const AWS = require("aws-sdk");

// Configura AWS SDK
// AWS.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   sessionToken: process.env.AWS_SESSION_TOKEN,
//   region: "us-east-1",
// });

// Use the following config instead when using DynamoDB local

const dynamodbClient = new AWS.DynamoDB.DocumentClient();

const rekognition = new AWS.Rekognition();

async function detectarFirma(document) {
  const params = {
    ProjectVersionArn:
      "arn:aws:rekognition:us-east-1:646324814021:project/documents-signed/version/documents-signed.2024-05-29T13.46.12/1717011973603",
    Image: {
      S3Object: {
        Bucket: "vana-user-images-dev",
        Name: document,
      },
    },
    MaxResults: 100,
  };

  console.log("params :>> ", params);

  try {
    const response = await rekognition.detectCustomLabels(params).promise();
    console.log("response :>> ", response);
    response.CustomLabels.forEach((label) => {
      console.log(`Label: ${label.Name}, Confidence: ${label.Confidence}`);
    });
  } catch (err) {
    console.error("Error detecting labels:", err);
  }
}

const params = {
  TableName: "document_analysis_records",
  IndexName: "country_index",
  KeyConditionExpression: "#country = :country",
  ExpressionAttributeValues: {
    ":country": "gt",
  },
  ExpressionAttributeNames: {
    "#country": "country",
  },
  ScanIndexForward: true,
};

dynamodbClient.query(params, function (err, data) {
  if (err) {
    console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
  } else {
    console.log("Query succeeded.");
    data.Items.forEach(function (item) {
      console.log(" -", item);
    });
  }
});

console.log("start");
// Llama a la función con tu bucket y nombre de documento
(async () => {
  // await detectarFirma("test/20240220130627_selfie.jpeg");
})();

console.log("end");
