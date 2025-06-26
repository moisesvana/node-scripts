const AWS = require("aws-sdk");
const fs = require("fs");

AWS.config.update({ region: "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = "internal_users_dev";
const TYPE_INDEX = "type_index";
const TYPE_VALUE = "ROLE";

async function scanRoles() {
  let lastEvaluatedKey = undefined;
  let count = 0;
  const allRoles = [];
  const missingPermissions = [];

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
        console.log("pk:", item.pk);
        allRoles.push(item);
        count++;

        const props = item.props || {};
        const permissions = props.permissions || {};

        if (
          !permissions.country_permissions ||
          !permissions.operational_permissions
        ) {
          console.log(`⚠️  FALTAN PERMISOS - pk: ${item.pk}`);
          missingPermissions.push(item);
        }
      });
      lastEvaluatedKey = data.LastEvaluatedKey;
    } catch (err) {
      console.error("Error consultando DynamoDB:", err);
      break;
    }
  } while (lastEvaluatedKey);

  console.log(`Total de registros leídos: ${count}`);

  if (missingPermissions.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const missingFileName = `roles-missing-permissions-${timestamp}.json`;
    fs.writeFileSync(
      missingFileName,
      JSON.stringify(missingPermissions, null, 2)
    );
    console.log(
      `Registros con permisos faltantes guardados en ${missingFileName}. Total: ${missingPermissions.length}`
    );
  } else {
    console.log("Todos los registros tienen las props permissions requeridas.");
  }

  return { allRoles, missingPermissions };
}

(async () => {
  await scanRoles();
})();
