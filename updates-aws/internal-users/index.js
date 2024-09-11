// ------------ NodeJS runtime ---------------
// Add aws-sdk in package.json as a dependency
// Example:
// {
//     "dependencies": {
//         "aws-sdk": "^2.0.9",
//     }
// }
// Create your credentials file at ~/.aws/credentials (C:\Users\USER_NAME\.aws\credentials for Windows users)
// Format of the above file should be:
//  [default]
//  aws_access_key_id = YOUR_ACCESS_KEY_ID
//  aws_secret_access_key = YOUR_SECRET_ACCESS_KEY

const AWS = require("aws-sdk");

// Create the DynamoDB Client with the region you want
const region = "us-east-1";
const dynamoDbClient = createDynamoDbClient(region);

// Create the input for query call
const queryInput = queryGetUsers();

// Call DynamoDB's query API
executeQuery(dynamoDbClient, queryInput).then(() => {
  console.info("Query API call has been executed.");
});

function createDynamoDbClient(regionName) {
  // Set the region
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: "us-east-1",
  });
  // Use the following config instead when using DynamoDB local
  // AWS.config.update({
  //   region: "localhost",
  //   endpoint: "http://localhost:8000",
  //   accessKeyId: "1tz0mo",
  //   secretAccessKey: "6llx7fr",
  // });
  return new AWS.DynamoDB();
}

function createUpdateItemInput(pk, department, status) {
  return {
    TableName: "internal_users_dev",
    Key: {
      pk: {
        S: pk,
      },
      sk: {
        S: pk,
      },
    },
    UpdateExpression: "SET #status = :status, #department = :department",
    ExpressionAttributeValues: {
      ":status": { S: status },
      ":department": { S: department },
    },
    ExpressionAttributeNames: {
      "#status": "status",
      "#department": "department",
    },
  };
}

function queryGetUsers() {
  return {
    TableName: "internal_users_dev",
    ScanIndexForward: true,
    IndexName: "type_index",
    KeyConditionExpression: "#d0a30 = :d0a30",
    ExpressionAttributeValues: {
      ":d0a30": {
        S: "USER",
      },
    },
    ExpressionAttributeNames: {
      "#d0a30": "type",
    },
  };
}

async function executeQuery(dynamoDbClient, queryInput) {
  // Call DynamoDB's query API
  try {
    const usersResponse = await dynamoDbClient.query(queryInput).promise();
    console.info("Query successful.");
    // Handle queryOutput
    console.log("length :>> ", usersResponse.Items.length);
    const users = usersResponse?.Items ?? [];
    for (let index = 0; index < users.length; index++) {
      const user = users[index];

      const email = user.email.S;
      const pk = `USER|${user.shown_id.S}`;
      const department = user.props.M.department.S.replace(
        "&",
        "and"
      ).toLowerCase();
      const status =
        user.props.M.status.S === "enabled" ? "active" : "inactive";
      const isDeleted = user.props.M?.deleted_at?.S;
      console.log(" :>> ");
      console.log("pk :>> ", pk);
      console.log("email :>> ", email);
      console.log("department :>> ", department);
      console.log("status :>> ", status);
      console.log("isDeleted :>> ", isDeleted);
      console.log(" :>> ");

      await dynamoDbClient
        .updateItem(createUpdateItemInput(pk, department, status))
        .promise();
    }
  } catch (err) {
    console.log("err :>> ", err);
    handleQueryError(err);
  }
}

// Handles errors during Query execution. Use recommendations in error messages below to
// add error handling specific to your application use-case.
function handleQueryError(err) {
  if (!err) {
    console.error("Encountered error object was empty");
    return;
  }
  if (!err.code) {
    console.error(
      `An exception occurred, investigate and configure retry strategy. Error: ${JSON.stringify(
        err
      )}`
    );
    return;
  }
  // here are no API specific errors to handle for Query, common DynamoDB API errors are handled below
  handleCommonErrors(err);
}

function handleCommonErrors(err) {
  switch (err.code) {
    case "InternalServerError":
      console.error(
        `Internal Server Error, generally safe to retry with exponential back-off. Error: ${err.message}`
      );
      return;
    case "ProvisionedThroughputExceededException":
      console.error(
        `Request rate is too high. If you're using a custom retry strategy make sure to retry with exponential back-off. ` +
          `Otherwise consider reducing frequency of requests or increasing provisioned capacity for your table or secondary index. Error: ${err.message}`
      );
      return;
    case "ResourceNotFoundException":
      console.error(
        `One of the tables was not found, verify table exists before retrying. Error: ${err.message}`
      );
      return;
    case "ServiceUnavailable":
      console.error(
        `Had trouble reaching DynamoDB. generally safe to retry with exponential back-off. Error: ${err.message}`
      );
      return;
    case "ThrottlingException":
      console.error(
        `Request denied due to throttling, generally safe to retry with exponential back-off. Error: ${err.message}`
      );
      return;
    case "UnrecognizedClientException":
      console.error(
        `The request signature is incorrect most likely due to an invalid AWS access key ID or secret key, fix before retrying. ` +
          `Error: ${err.message}`
      );
      return;
    case "ValidationException":
      console.error(
        `The input fails to satisfy the constraints specified by DynamoDB, ` +
          `fix input before retrying. Error: ${err.message}`
      );
      return;
    case "RequestLimitExceeded":
      console.error(
        `Throughput exceeds the current throughput limit for your account, ` +
          `increase account level throughput before retrying. Error: ${err.message}`
      );
      return;
    default:
      console.error(
        `An exception occurred, investigate and configure retry strategy. Error: ${err.message}`
      );
      return;
  }
}
