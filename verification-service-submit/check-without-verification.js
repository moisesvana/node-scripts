import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import "dotenv/config";

const marshallOptions = {
  convertEmptyValues: true,
  removeUndefinedValues: true,
  convertClassInstanceToMap: true,
};

const unmarshallOptions = {
  wrapNumbers: false,
};

const translateConfig = { marshallOptions, unmarshallOptions };
const ddbClient = new DynamoDBClient();
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, translateConfig);

const BATCH_SIZE = 100;

const getByStatus = async (status) => {
  const queryCommandInput = {
    TableName: "loan_request_state",
    IndexName: "status_index",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":status": status,
    },
    KeyConditionExpression: "#status = :status",
  };
  let items = [];
  let moreItems = true;
  while (moreItems) {
    moreItems = false;
    let response = await ddbDocClient.send(new QueryCommand(queryCommandInput));
    if (response && Array.isArray(response.Items)) {
      items = items.concat(response.Items);
    }
    if (typeof response.LastEvaluatedKey != "undefined") {
      moreItems = true;
      queryCommandInput["ExclusiveStartKey"] = response.LastEvaluatedKey;
    }
  }
  return items;
};

const getBlobsByUser = async (userId) => {
  const queryCommandInput = {
    TableName: "storage_records",
    IndexName: "search_subsearch_index",
    ExpressionAttributeNames: {
      "#search": "search",
      "#subsearch": "subsearch",
    },
    ExpressionAttributeValues: {
      ":search": `USER|${userId}|CATEGORY|id-document`,
      ":subsearch": "ACTIVE|true",
    },
    KeyConditionExpression: "#search = :search AND #subsearch = :subsearch",
  };
  let items = [];
  let moreItems = true;
  while (moreItems) {
    moreItems = false;
    let response = await ddbDocClient.send(new QueryCommand(queryCommandInput));
    if (response && Array.isArray(response.Items)) {
      items = items.concat(response.Items);
    }
    if (typeof response.LastEvaluatedKey != "undefined") {
      moreItems = true;
      queryCommandInput["ExclusiveStartKey"] = response.LastEvaluatedKey;
    }
  }
  return items;
};

const getVerificationsByUserAndCountry = async (userId, country) => {
  const queryCommandInput = {
    TableName: "verification_records",
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `USER|${userId}`,
      ":skPrefix": `CATEGORY|${country.toLowerCase()}-credit-document-verification`,
    },
    ScanIndexForward: false,
  };
  let items = [];
  let moreItems = true;
  while (moreItems) {
    moreItems = false;
    let response = await ddbDocClient.send(new QueryCommand(queryCommandInput));
    if (response && Array.isArray(response.Items)) {
      items = items.concat(response.Items);
    }
    if (typeof response.LastEvaluatedKey != "undefined") {
      moreItems = true;
      queryCommandInput["ExclusiveStartKey"] = response.LastEvaluatedKey;
    }
  }

  return items.length > 0
    ? items.sort((a, b) => b.props.number - a.props.number)[0]
    : null;
};

const getLMSTicket = async (loanRequestId) => {
  const getCommandInput = {
    TableName: "costumer_tickets_records",
    Key: {
      pk: `TICKET_VERIFICATION|${loanRequestId}`,
    },
  };
  const command = new GetCommand(getCommandInput);
  const result = await ddbDocClient.send(command);
  if (!result.Item) {
    return null;
  }
  return result.Item;
};

const getLMSTicketV2 = async (loanRequestId) => {
  const getCommandInput = {
    TableName: "costumer_tickets_records",
    Key: {
      pk: `TICKET_REQUEST|${loanRequestId}`,
    },
  };
  const command = new GetCommand(getCommandInput);
  const result = await ddbDocClient.send(command);
  if (!result.Item) {
    return null;
  }
  return result.Item;
};

const getByBatch = async (batch, toCreate, toSubmit) => {
  const promises = batch.map(async (record) => {
    const {
      user_id: userId,
      product_id: productId,
      status,
      loan_request_id: loanRequestId,
      created_at: createdAt,
      updated_at: updatedAt,
    } = record;
    const country = getCountry(productId);
    const [verification, blobs, lmsTicket, lmsTicketV2] = await Promise.all([
      getVerificationsByUserAndCountry(userId, country),
      getBlobsByUser(userId),
      getLMSTicket(loanRequestId),
      getLMSTicketV2(loanRequestId),
    ]);
    const data = {
      userId,
      country,
      status,
      loanRequestId,
      createdAt,
      updatedAt,
    };
    if (
      (!verification || verification.props.status !== "submitted") &&
      !blobs.every((item) => item.status === "approved")
      //!(lmsTicket || lmsTicketV2)*/

      /*!verification &&
      !blobs.every(item => item.status === "approved")*/
    ) {
      if (!verification) {
        toCreate.push(data);
      }
      if (status === "document_sent") {
        console.error("verification", verification, "blobs", blobs, "\n\n");
        const vData = {
          ...data,
          selfieBlobId:
            blobs
              .find((b) => b.props.subcategory === "id-selfie")
              ?.pk?.split("|")[1] || null,
          documentBackBlobId:
            blobs
              .find((b) => b.props.subcategory === "id-back")
              ?.pk?.split("|")[1] || null,
          documentFrontBlobId:
            blobs
              .find((b) => b.props.subcategory === "id-front")
              ?.pk?.split("|")[1] || null,
        };
        if (!verification) {
          toCreate.push(vData);
        } else {
          toSubmit.push(vData);
        }
      }
    }
    return verification;
  });
  await Promise.all(promises);
  return { toCreate, toSubmit };
};

const getCountry = (productId) => {
  if (productId.includes("gt")) {
    return "GT";
  } else if (productId.includes("do")) {
    return "DO";
  } else if (productId.includes("hn")) {
    return "HN";
  } else if (productId.includes("pe")) {
    return "PE";
  }
  return null;
};

const [documentSent] = await Promise.all([
  //getByStatus("offer_accepted"),
  getByStatus("document_sent"),
]);

const toCheck = [...documentSent];
const toCreate = [];
const toSubmit = [];
for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
  const batch = toCheck.slice(i, i + BATCH_SIZE);
  await getByBatch(batch, toCreate, toSubmit);
}
const response = { toCreate, toSubmit };
console.log(JSON.stringify(response, null, 2));

/* usage:
node --max-old-space-size=8192 check-without-verification.js > verifications_to_process.json
*/
