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

const s3 = new AWS.S3();

const dynamodbClient = new AWS.DynamoDB.DocumentClient();

const bucket = "vana-user-images_dev";
const tableName = "document_analysis_records_dev";
const params = {
  TableName: tableName,
  IndexName: "country_index",
  KeyConditionExpression: "#country = :country",
  ExpressionAttributeValues: {
    ":country": "hn",
  },
  ExpressionAttributeNames: {
    "#country": "country",
  },
  ScanIndexForward: true,
  Limit: 200,
};

async function main() {
  dynamodbClient.query(params, async function (err, data) {
    if (err) {
      console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
    } else {
      console.log("Query succeeded.", data.Items.length);
      let total = 0;

      for (let index = 0; index < data.Items.length; index++) {
        const item = data.Items[index];
        console.log(green(`start ${index + 1} - ${item.pk} start`));

        console.log(red("image: " + item?.quality_analysis?.front?.url));
        if (item?.quality_analysis?.front?.url) {
          const document = item.quality_analysis.front.url;
          const file = fs.createWriteStream(`hn-2/${index}.jpg`); // replace with the path where you want to save the file
          s3.getObject({
            Bucket: bucket, // replace with your bucket name
            Key: document, // replace with the file key
          })
            .createReadStream()
            .pipe(file);
          total++;
        }
        console.log(cyan(`end ${index + 1}`));
      }

      console.log("total images", total);
    }
  });

  // s3.listObjectsV2(
  //   {
  //     Bucket: bucket,
  //     Prefix: "test/gt/",
  //   },
  //   async function (err, data) {
  //     if (err) {
  //       console.log(err, err.stack); // an error occurred
  //     } else {
  //       let total = 0;
  //       let totalConfidence = 0;
  //       let totalFirmaFound = 0;
  //       for (let index = 0; index < data.Contents.length; index++) {
  //         const obj = data.Contents[index];
  //         if (index !== 0) {
  //           console.log(green(`start ${index}`));
  //           console.log(red("image: " + obj.Key));
  //           if (obj.Key) {
  //             const document = obj.Key;

  //             const blocks = await analizarDocumento(bucket, document);
  //             if (blocks) {
  //               const confidence = extraerFirma(blocks);
  //               console.log(red("confidence: " + confidence));
  //               totalConfidence = totalConfidence + confidence;
  //               if (confidence > 0) {
  //                 totalFirmaFound++;
  //               }
  //             }
  //             total++;
  //           }
  //           console.log(cyan(`end`));
  //         }
  //       }
  //       console.log("totalFirmaFound", totalFirmaFound);
  //       console.log("total images", total);
  //       console.log("totalConfidence", totalConfidence);
  //       console.log("average", totalConfidence / total);
  //     }
  //   }
  // );
}

main().catch(console.error);
