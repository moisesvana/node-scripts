import AWS from "aws-sdk";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LOAN_REQUEST_STATE_TABLE = process.env.LOAN_REQUEST_STATE_TABLE;
const CREDIT_API_KEY = process.env.API_KEY_CREDIT;
const STORAGE_API_KEY = process.env.API_KEY_STORAGE;
const CREDIT_API_BASE_URL = "https://credit.api.vana-private.com/v1";
const STORAGE_API_BASE_URL = "https://storage.api.vana-private.com/v1";

const items = JSON.parse(fs.readFileSync("./check-verification.json", "utf-8"));

async function getLoanRequestState(loanRequestId) {
  const params = {
    TableName: LOAN_REQUEST_STATE_TABLE,
    Key: { loan_request_id: loanRequestId },
  };
  const result = await dynamodb.get(params).promise();
  return result.Item || null;
}

async function getUserVerifications(userId) {
  const response = await axios.get(
    `${CREDIT_API_BASE_URL}/users/${userId}/verifications`,
    { headers: { "x-api-key": CREDIT_API_KEY } },
  );
  return response.data;
}

async function getUserIdDocumentImages(userId) {
  const response = await axios.get(
    `${STORAGE_API_BASE_URL}/users/${userId}/categories/id-document/download-url`,
    { headers: { "x-api-key": STORAGE_API_KEY } },
  );
  const items = response.data?.data?.items ?? [];
  return items.map((i) => ({ blob_id: i.id, status: i.status }));
}

(async () => {
  try {
    const statusCount = new Map();
    const requiredItems = [];

    for (const item of items) {
      const { loan_request_id } = item;
      const record = await getLoanRequestState(loan_request_id);

      if (!record) {
        console.log(`[NOT FOUND] loan_request_id: ${loan_request_id}`);
        continue;
      }

      console.log(
        `----------------------  loan_request_id: ${record.loan_request_id} ---------------------------`,
      );

      console.log({
        loan_request_id: record.loan_request_id,
        user_id: record.user_id,
        status: record.status,
        created_at: record.created_at,
      });

      const { data: verifications } = await getUserVerifications(
        record.user_id,
      );
      const creditDocVerification = verifications.find((v) =>
        /^[a-z]+-credit-document-verification$/.test(v.category),
      );

      let idDocumentImages = [];
      try {
        idDocumentImages = await getUserIdDocumentImages(record.user_id);
        console.log("  id_document_images:");
        for (const img of idDocumentImages) {
          console.log(`    - blob_id: ${img.blob_id}, status: ${img.status}`);
        }
      } catch (e) {
        console.log("  [error fetching id-document images]:", e.message);
      }

      if (creditDocVerification) {
        console.log("  verification_id:", creditDocVerification.id);
        console.log("  verification_status:", creditDocVerification.status);
        const s = `${creditDocVerification.status}_${record.status}`;
        statusCount.set(s, (statusCount.get(s) ?? 0) + 1);
        if (s === "required_document_sent") {
          requiredItems.push({
            loan_request_id: record.loan_request_id,
            user_id: record.user_id,
            loan_request_status: record.status,
            created_at: record.created_at,
            verification_id: creditDocVerification.id,
            verification_status: creditDocVerification.status,
            verification_category: creditDocVerification.category,
            id_document_images: idDocumentImages,
          });
        }
      } else {
        console.log("  [NO credit-document-verification found]");
        statusCount.set("not_found", (statusCount.get("not_found") ?? 0) + 1);
      }
      console.log(`-------------------------------------------------`);
      console.log("\n");
    }

    console.log("\n--- verification status count ---");
    for (const [status, count] of statusCount) {
      console.log(`  ${status}: ${count}`);
    }

    if (requiredItems.length > 0) {
      const filename = `logs/required-verifications-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      if (!fs.existsSync("logs")) fs.mkdirSync("logs");
      fs.writeFileSync(filename, JSON.stringify(requiredItems, null, 2));
      console.log(
        `\nSaved ${requiredItems.length} required items to ${filename}`,
      );
    }

    console.log("\nScript completed successfully.");
  } catch (err) {
    console.error("Error in main process:", err);
    process.exit(1);
  }
})();
