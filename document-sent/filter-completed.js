import AWS from "aws-sdk";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const CUSTOMER_TICKETS_TABLE = process.env.CUSTOMER_TICKETS_TABLE;
const INTERNAL_USERS_TABLE = process.env.INTERNAL_USERS_TABLE;
const LOAN_REQUEST_STATE_TABLE = process.env.LOAN_REQUEST_STATE_TABLE;
const API_KEY_STORAGE = process.env.API_KEY_STORAGE;
const API_KEY_CREDIT = process.env.API_KEY_CREDIT;
const INPUT_FILE = "logs/to-fix.json";

async function getUserByEmail(email) {
  const params = {
    TableName: INTERNAL_USERS_TABLE,
    IndexName: "email_index",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: { ":email": email },
    Limit: 1,
  };

  const result = await dynamodb.query(params).promise();
  return result.Items?.[0];
}

async function getUploadedDocs(userId) {
  const response = await axios.get(
    `https://storage.api.vana-private.com/v1/users/${userId}/categories/id-document/download-url`,
    {
      headers: {
        "x-api-key": API_KEY_STORAGE,
      },
    },
  );
  const len = response?.data?.data?.items?.length;
  const items = response?.data?.data?.items || [];
  return len === 3 ? items : items.filter((i) => i.status === "uploaded");
}

async function getLoanRequestStatus(loanRequestId) {
  const params = {
    TableName: LOAN_REQUEST_STATE_TABLE,
    Key: { loan_request_id: loanRequestId },
  };
  const result = await dynamodb.get(params).promise();
  return result.Item?.status || null;
}

async function getTicketLog(verificationId) {
  const key = `LOG|${verificationId}`;
  const params = {
    TableName: CUSTOMER_TICKETS_TABLE,
    IndexName: "sk_index",
    KeyConditionExpression: "sk = :sk",
    ExpressionAttributeValues: { ":sk": key },
    ScanIndexForward: false,
  };

  const result = await dynamodb.query(params).promise();
  return result.Items;
}

(async () => {
  try {
    if (!fs.existsSync(INPUT_FILE)) {
      console.error(`File not found: ${INPUT_FILE}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(INPUT_FILE, "utf-8");
    const items = JSON.parse(raw);

    const completed = items.filter((item) => item.status === "completed");

    console.log(
      `\n------------------------------ Items with status=completed (${completed.length}/${items.length}) ------------------------------`,
    );
    const counts = {
      total: items.length,
      completed: completed.length,
      skipped_not_document_sent: 0,
      skipped_no_ticket_log: 0,
      skipped_no_status: 0,
      sent: 0,
    };
    const report = { sent: [], skipped: [] };

    for (const ticketItem of completed) {
      console.log(
        `\nloan_request_id: ${ticketItem.loan_request_id} | verification_id: ${ticketItem.verification_id}`,
      );

      const ticketLogs = await getTicketLog(ticketItem.verification_id);
      if (!ticketLogs?.length) {
        console.log("  ticket_log: not found");
        counts.skipped_no_ticket_log++;
        report.skipped.push({
          loan_request_id: ticketItem.loan_request_id,
          verification_id: ticketItem.verification_id,
          reason: "no_ticket_log",
        });
        continue;
      }

      const statusToUpdate = ticketLogs.filter(
        (l) =>
          l.ticket_status &&
          l.props.ticket_id === ticketItem.verification_id &&
          (l.user === ticketItem.user ||
            l.user === "decision-engine-automatic"),
      );
      const status = statusToUpdate?.[0]?.ticket_status;
      if (!status) {
        console.log("  status: not found in ticket_log");
        counts.skipped_no_status++;
        report.skipped.push({
          loan_request_id: ticketItem.loan_request_id,
          verification_id: ticketItem.verification_id,
          reason: "no_status_in_log",
        });
        continue;
      }
      console.log(`  ticket_log status: ${status}`);

      const currentLoanStatus = await getLoanRequestStatus(
        ticketItem.loan_request_id,
      );
      console.log(`  loan_request status: ${currentLoanStatus}`);
      if (currentLoanStatus !== "document_sent") {
        console.log(
          `  Skipping: loan_request no longer in document_sent (current: ${currentLoanStatus})`,
        );
        counts.skipped_not_document_sent++;
        report.skipped.push({
          loan_request_id: ticketItem.loan_request_id,
          verification_id: ticketItem.verification_id,
          reason: "not_document_sent",
          current_status: currentLoanStatus,
        });
        continue;
      }

      let googleId = null;
      if (ticketItem?.user) {
        const userRecord = await getUserByEmail(ticketItem.user);
        googleId = userRecord?.pk.split("|")?.[1] || null;
      }

      const docs = await getUploadedDocs(ticketItem.user_id);
      for (const doc of docs) {
        const newImagStatus = status === "approve" ? "approved" : "rejected";
        console.log(
          `  blob id: ${doc.id}, status: ${doc.status} -> ${newImagStatus}`,
        );
        await axios.patch(
          `https://storage.api.vana-private.com/v1/users/${ticketItem.user_id}/blobs`,
          {
            data: {
              updates: [
                {
                  id: doc.id,
                  status: newImagStatus,
                },
              ],
            },
          },
          {
            headers: {
              "x-api-key": API_KEY_STORAGE,
              "Content-Type": "application/json",
            },
          },
        );
        console.log(`  blob updated: ${doc.id} -> ${newImagStatus}`);
      }

      //rechazar verification
      // await axios.post(
      //   `https://credit.api.vana-private.com/v1/users/${item.user_id}/verifications/${item.verification_id}/rejection`,
      //   { ... },
      // );

      //actualizar ticket to completed
      // const updateParams = { ... };
      // await dynamodb.update(updateParams).promise();

      const consumeEventPayload = {
        type: ticketItem.type || null,
        ticket_id: ticketItem.verification_id,
        username: googleId,
        result: status.trim() === "approve" ? "approve" : "documentreject",
        //result: "documentreject", // force
        transaction_origin: !googleId
          ? "internal-tools-automated-process"
          : "internal-tools-decision-engine-process",
      };

      console.log(
        "  consumeEventPayload :>> ",
        JSON.stringify(consumeEventPayload),
      );

      const event = {
        version: "0",
        id: "4e66d305-c44b-318e-9dcd-2ee02f3fd25d",
        "detail-type": "InternalTicket.RuleEngineTicketProcessed",
        source: "vana.internal-tickets.service",
        account: "384120103923",
        time: "2025-11-28T22:56:06Z",
        region: "us-east-1",
        resources: [],
        detail: consumeEventPayload,
      };

      const lambdaResponse = await lambda
        .invoke({
          FunctionName: "internal-tickets-consume-events",
          InvocationType: "RequestResponse",
          Payload: JSON.stringify(event),
        })
        .promise();

      const lambdaPayload = JSON.parse(lambdaResponse.Payload || "{}");
      console.log(`  lambda statusCode: ${lambdaPayload?.statusCode}`);

      report.sent.push({
        loan_request_id: ticketItem.loan_request_id,
        user_id: ticketItem.user_id,
        ...consumeEventPayload,
        lambda_status_code: lambdaPayload?.statusCode,
      });
      counts.sent++;
    }

    const reportFile = `logs/report-${Date.now()}.json`;
    fs.writeFileSync(
      reportFile,
      JSON.stringify({ counts, ...report }, null, 2),
    );

    console.log(
      "\n------------------------------ Summary ------------------------------",
    );
    console.log(`  total in file         : ${counts.total}`);
    console.log(`  completed (to process): ${counts.completed}`);
    console.log(`  sent to lambda        : ${counts.sent}`);
    console.log(
      `  skipped (not doc_sent): ${counts.skipped_not_document_sent}`,
    );
    console.log(`  skipped (no log)      : ${counts.skipped_no_ticket_log}`);
    console.log(`  skipped (no status)   : ${counts.skipped_no_status}`);
    console.log(`  report saved to       : ${reportFile}`);
    console.log("\nDone.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
