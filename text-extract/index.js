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
const textract = new AWS.Textract();

async function analizarDocumento(bucket, document) {
  const params = {
    Document: {
      S3Object: {
        Bucket: bucket,
        Name: document,
      },
    },
  };

  try {
    const data = await textract
      .analyzeDocument({
        ...params,
        FeatureTypes: ["SIGNATURES"],
      })
      .promise();

    // console.log("data", data);

    return data.Blocks;
  } catch (error) {
    console.error("Error analizando documento:", error);
  }
}

function extraerFirma(blocks) {
  const signatureBlocks = blocks.filter(
    (block) => block.BlockType === "SIGNATURE"
  );
  let confidence = 0;
  signatureBlocks.forEach((block) => {
    console.log(`Firma detectada: ${block.BlockType}`);
    console.log(`Confianza: ${block.Confidence}`);
    confidence = confidence + block?.Confidence || 0;
  });
  return confidence;
}

async function main() {
  const bucket = "vana-user-images-dev";

  s3.listObjectsV2(
    {
      Bucket: bucket,
      Prefix: "test/gt-2/",
    },
    async function (err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
      } else {
        let total = 0;
        let totalConfidence = 0;
        let totalFirmaFound = 0;
        for (let index = 0; index < data.Contents.length; index++) {
          const obj = data.Contents[index];
          if (index !== 0) {
            console.log(green(`start ${index}`));
            console.log(red("image: " + obj.Key));
            if (obj.Key) {
              const document = obj.Key;

              const blocks = await analizarDocumento(bucket, document);
              if (blocks) {
                const confidence = extraerFirma(blocks);
                console.log(red("confidence: " + confidence));
                totalConfidence = totalConfidence + confidence;
                if (confidence > 0) {
                  totalFirmaFound++;
                }
              }
              total++;
            }
            console.log(cyan(`end ${index}`));
          }
        }
        console.log("totalFirmaFound", totalFirmaFound);
        console.log("total images", total);
        console.log("totalConfidence", totalConfidence);
        console.log("total average", totalConfidence / total);
        console.log(
          "total average firma found",
          totalConfidence / totalFirmaFound
        );
      }
    }
  );
}

main().catch(console.error);
