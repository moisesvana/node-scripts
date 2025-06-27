const AWS = require("aws-sdk");
const fs = require("fs");

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = "internal_users_dev";
const TYPE_INDEX = "type_index";
const TYPE_VALUE = "USER";

async function scanUsers() {
  let lastEvaluatedKey = undefined;
  let count = 0;
  const allUsers = [];

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: TYPE_INDEX,
      KeyConditionExpression: "#type = :typeValue",
      ExpressionAttributeNames: {
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":typeValue": TYPE_VALUE,
      },
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 100,
    };

    try {
      const data = await dynamodb.query(params).promise();
      data.Items.forEach((item) => {
        console.log("pk:", item.pk, "sk:", item.sk);
        allUsers.push(item);
        count++;
      });
      lastEvaluatedKey = data.LastEvaluatedKey;
    } catch (err) {
      console.error("Error consultando DynamoDB:", err);
      break;
    }
  } while (lastEvaluatedKey);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `users-backup-${timestamp}.json`;
  fs.writeFileSync(backupFileName, JSON.stringify(allUsers, null, 2));
  console.log(
    `Backup guardado en ${backupFileName}. Total de registros: ${count}`
  );
  return allUsers;
}

function buildNewProps(oldProps) {
  return {
    created_at: oldProps.created_at,
    department: oldProps.department,
    email: oldProps.email,
    first_name: oldProps.first_name,
    last_name: oldProps.last_name,
    role: Array.isArray(oldProps.roles)
      ? oldProps.roles[0]
      : oldProps?.role?.length > 0
      ? oldProps.role
      : "",
    status: oldProps.status,
    updated_at: new Date().toISOString(),
    extra_permissions: {
      country_permissions: [],
      operational_permissions: [],
    },
  };
}

async function updateUsers(users) {
  let updated = 0;
  const failed = [];
  for (const user of users) {
    const newProps = buildNewProps(user.props);
    const params = {
      TableName: TABLE_NAME,
      Key: {
        pk: user.pk,
        sk: user.sk,
      },
      UpdateExpression: "set #props = :props, #shown_id = :shown_id",
      ExpressionAttributeNames: {
        "#props": "props",
        "#shown_id": "shown_id",
      },
      ExpressionAttributeValues: {
        ":props": newProps,
        ":shown_id": user.email,
      },
    };
    try {
      await dynamodb.update(params).promise();
      updated++;
      console.log(`Actualizado: pk=${user.pk}, sk=${user.sk}`);
    } catch (err) {
      failed.push({ ...user, error: err.message });
      console.error(`Error actualizando pk=${user.pk}, sk=${user.sk}:`, err);
    }
  }
  console.log(`Total actualizados: ${updated}`);
  if (failed.length > 0) {
    const failedFileName = `users-failed.json`;
    fs.writeFileSync(failedFileName, JSON.stringify(failed, null, 2));
    console.log(`Registros fallidos guardados en ${failedFileName}`);
  }
}

(async () => {
  const users = await scanUsers();
  await updateUsers(users);
})();
