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
    let fixed = 0;
    const report = [];
    for (const ticketItem of completed) {
      const ticketLogs = await getTicketLog(ticketItem.verification_id);
      if (ticketLogs?.length) {
        const statusToUpdate = ticketLogs.filter(
          (l) =>
            l.ticket_status &&
            l.props.ticket_id === ticketItem.verification_id &&
            (l.user === ticketItem.user ||
              l.user === "decision-engine-automatic"),
        );
        const status = statusToUpdate?.[0]?.ticket_status;
        console.log(
          `\nloan_request_id: ${ticketItem.loan_request_id} | verification_id: ${ticketItem.verification_id}`,
        );
        if (status) {
          console.log("status  :>> ", status);

          let googleId = null;
          if (ticketItem?.user) {
            const userRecord = await getUserByEmail(ticketItem.user);
            googleId = userRecord?.pk.split("|")?.[1] || null;
          }

          // doc service - 4 imgs - uploaded

          const docs = await getUploadedDocs(ticketItem.user_id);

          for (const doc of docs) {
            const newImagStatus =
              status === "approve" ? "approved" : "rejected";
            console.log(`id: ${doc.id}, status: ${doc.status}`);
            await axios.patch(
              `https://storage.api.vana-private.com/v1/users/${ticketItem.user_id}/blobs`,
              {
                data: {
                  updates: [
                    {
                      id: doc.id,
                      status: newImagStatus, // internal-tools status = approve,
                      //status: "rejected", // internal-tools status = approve,
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
            console.log("blob updated:", doc.id, "to status:", newImagStatus);
          }

          //rechazar verification
          // await axios.post(
          //   `https://credit.api.vana-private.com/v1/users/${item.user_id}/verifications/${item.verification_id}/rejection`,
          //   {
          //     data: {
          //       username: null,
          //       origin: "internal-tools-automated-process",
          //       origin_id: "automated_rejections",
          //       criteria: [
          //         { type: "SELFIE_CLEAR_IMAGE", status: "rejected" },
          //         { type: "BACK_CLEAR_IMAGE", status: "rejected" },
          //         { type: "FRONT_CLEAR_IMAGE", status: "rejected" },
          //         { type: "SOFT_REJECT", status: "approved" },
          //         { type: "HARD_REJECT", status: "approved" },
          //       ],
          //     },
          //   },
          //   {
          //     headers: {
          //       "x-api-key": API_KEY_CREDIT,
          //       "Content-Type": "application/json",
          //     },
          //   },
          // );
          // console.log("verification rejected:", item.verification_id);

          //actualizar ticket to completed
          // const updateParams = {
          //   TableName: CUSTOMER_TICKETS_TABLE,
          //   Key: {
          //     pk: `TICKET_VERIFICATION|${ticketItem.verification_id}`,
          //   },
          //   UpdateExpression: "SET #status = :completed, #updated_at = :now",
          //   ExpressionAttributeNames: {
          //     "#status": "status",
          //     "#updated_at": "updated_at",
          //   },
          //   ExpressionAttributeValues: {
          //     ":completed": "completed",
          //     ":created": "created",
          //     ":now": new Date().toISOString(),
          //   },
          //   ConditionExpression: "#status = :created",
          //   ReturnValues: "ALL_NEW",
          // };
          // await dynamodb.update(updateParams).promise();
          // console.log(
          //   "ticket updated to completed:",
          //   ticketItem.verification_id,
          // );

          const consumeEventPayload = {
            type: ticketItem.type || null,
            ticket_id: ticketItem.verification_id,
            username: googleId,
            result: status.trim() === "approve" ? "approve" : "documentreject", // approve se aprueba de lo contrario se rechaza
            //result: "documentreject", // force
            transaction_origin: !googleId
              ? "internal-tools-automated-process"
              : "internal-tools-decision-engine-process",
          };

          console.log(
            "consumeEventPayload :>> ",
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

          //const lambdaPayload = JSON.parse(lambdaResponse.Payload);
          //console.log("lambdaResponse :>> ", lambdaPayload);

          report.push({
            ...consumeEventPayload,
            user_id: ticketItem.user_id,
            res: lambdaResponse,
          });
          fixed++;
        } else {
          console.log("status  :>> Not found");
        }
      } else {
        console.log("  ticket_log: not found");
      }
    }

    const reportFile = `logs/report-${Date.now()}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`Report saved to ${reportFile} (${report.length} events)`);
    console.log("fixed", fixed);
    console.log("\nDone.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
