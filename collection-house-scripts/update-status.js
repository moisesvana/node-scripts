const AWS = require("aws-sdk");
const prod = false;
const prefix = prod ? "" : "_dev";
const collectionHouseRecordsTable = `collection_house_records${prefix}`;

const PROD_IDS = [
  //   "bc6682f6-c0b8-435d-88fe-a11b66a255da",
  //   "ecdae697-c6e5-4782-885d-b2cfa49ab9fd",
  //   "d27bee9b-cee1-40b0-b66c-469f2280f4b7",
  //   "4a6d369c-ebfc-4626-bcd8-62cc2d325c15",
  //   "b12eae00-fc52-4454-9f92-0614888a0a2c",
  //   "b64ece32-88e3-4d93-8846-ab985a1fab50",
  //   "eba49c97-fe66-47e7-9ab0-f2ffdde379e2",
  //   "f3ec6dc2-76b7-4321-bc57-f26aab4d1a63",
  //   "a229bbba-adaf-467a-9b6d-cf8307b33bb5",
  //   "021fb26a-3459-4322-8851-f34a7b8b2749",
  //   "e946cdb7-7604-4553-945d-eefc9d1db084",
  //   "8d1f7110-a8e8-4706-84d5-b26b7dc9b4f5",
  //   "41eb59c2-88e9-40df-b8ec-1cdf8d6d32cd",
  //   "ad4524d2-6f9f-459d-9ea9-c6a3515b7516",
  //   "4ad4ff04-a1ae-4428-ac4f-a112dc79d904",
  //   "0ffaddc2-1953-4636-9a12-391d05b976a1",
  //   "862c7fc0-e6a8-421b-b9ac-2eb2c806f620",
  //   "ec9d7753-0e5a-4ef5-bf57-cc636f6842f0",
  //   "1f46941b-61c5-429b-a18e-7b8c4ba0337b",
  //   "c9c499e9-1c59-4fdd-b617-6a3d53b3b92e",
  //   "6eaab79f-3738-4dd0-867c-fb2f17acf65d",
  //   "5799fc02-7387-42f4-8703-916194964ef6",
  //   "8e045baf-afb8-4bdb-ba5a-3012c5ec82d5",
  //   "5fe9625d-aebb-4786-90d1-cf4f3cf4c11d",
  //   "a7ec45b1-2dca-426d-91e6-a728bbe7995a",
  //   "a2388e51-b329-4b7e-be0a-23e111233134",
  //   "d5a55cde-8205-450b-abca-1b247bcfefe9",
  //   "310c8d64-e92f-45ce-9571-c8405a0fe907",
  //   "300648a8-a4bc-4d48-8888-e502879b92a1",
  //   "e3f27828-c4d9-49c8-aebd-e4ddee0838ba",
  //   "54667941-f4b9-4309-bdef-5dc6b9f8d242",
  //   "3b5e96a1-e518-4b9f-bb0e-dfed647b436a",
  //   "3dca0004-8aaa-40c5-a2ef-7a06e5ad0a98",
  //   "223377ea-0198-424a-b29d-03fce59cacbe",
  //   "a1ab2b0e-8a0b-49ce-abfa-f84877fcb0e2",
  //   "d7c77d89-9eab-4aff-ae8c-cb1ca05ea3f9",
  //   "dacf3032-9362-4faf-873e-999c5c9699de",
  //   "9e63b565-16bf-4e18-a6a5-9f7d4bc0d0e9",
  //   "44efd262-92a3-4d15-bb65-a11971975055",
  //   "d501e3f8-d274-4099-8dea-6242bd43b386",
  //   "3924095f-102e-4abb-9afc-b55e84c8c529",
  //   "693091ea-afda-4ac2-935d-01a78c48e0aa",
  //   "6d06d0f3-486d-459c-8293-6a912a632ed6",
  //   "20c9f388-4f53-48e3-b3ed-a1b948918fda",
  //   "ea00fcaf-ccc7-4bba-8923-79c80a68c3a1",
  //   "22632806-7738-4cf3-93e6-249ec8c8ca52",
  //   "c37383b4-6b9c-4963-a107-2a069d577821",
  //   "0135b7ed-0e7d-46da-820d-be70ede4db5a",
  //   "663da512-918c-4e41-a288-2eafdc12a4e4",
  //   "b45dc51b-1e05-4e2b-9f23-2cdcc70fda0c",
  //   "85460d71-f6d2-40d0-b088-71363cf9882c",
  //   "2b1f0102-f2cb-4599-b436-72e9d910e78c",
  //   "8fa5e0b5-7565-466a-b43a-17f9db43cdaf",
  //   "d7df55c5-4d18-4145-8240-b26a75db799d",
  //   "e6ff7bb1-7a4f-47f7-a667-8bb2b09e349a",
  //   "3d63cb82-e015-4f1b-9bee-343bcc8eb5a5",
  //   "e92909d3-878f-4bd3-ad0e-68cabdcbf4ac",
  //   "771cf653-9199-4116-8113-7ccc3595fa12",
  //   "10ccd2a9-843d-4b7e-a4b9-232a198896f7", // 0 loans
  "655d6d99-fa65-4dcd-9a95-7146e9d16009",
  "3d1266a0-aaae-405f-82b1-6f9539815aab",
  "7100a25d-60ad-4f70-8aa0-551299dd4ba1",
  "ce9317a9-5247-4158-855d-e5a01f4fc5f0",
  "cefd6a63-0bc3-4215-bfbc-a61558fb93eb",
  "9f67a72f-b120-49e7-835a-ab55016f0e78",
  "a9d3e244-1c51-4e81-a865-75e52871f310",
  "62885600-e1ef-4ae1-a3db-4d0cc85ac7c6",
  "7a59ba80-d033-4352-ac3c-972b5ba24344",
  "d4b71a6d-84ec-4756-861f-72a399308612",
  "aa683d5f-48c6-4547-bc3b-a6a8315a7494",
  "0495b865-98b8-4c66-9096-1b883afdf1f4",
  "86420b02-f37b-4c4d-a2c8-40a9c3fe4e78", // 0
  "b74adabc-f800-4976-a2e1-72243d95131e",
  "95cccac9-d4b2-44b5-a9d1-c5ddac6eb681",
  "f5fc22b7-108f-41c1-bc13-f53528d4e21b",
  "6a45de4c-a929-4131-b3d5-f4b859a0e0e9",
  "d2a7e60d-0634-488b-9d6d-a30d2c3e400b",
  "68902375-2e39-4d9a-83ce-f93d2c1d5b44",
  "3179921d-6b31-4d57-9e42-bd4afcd09616",
  "7e62c44f-1048-4403-9ba9-b7295d071092",
  "fc403ed6-fd81-4b57-b97a-818c4af71aed",
  "b72bf761-a041-402e-a949-977d037413fa",
  "1e2cae00-7f7c-4115-90c1-8815eb208c7c",
  "899624fd-38b6-4dcc-acb1-6542acd8cab7",
];

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "us-east-1",
});

const dynamodbClient = new AWS.DynamoDB.DocumentClient();

const getLoanAssignments = async (pkParam) => {
  const findParams = {
    TableName: collectionHouseRecordsTable,
    ExpressionAttributeNames: {
      "#pk": "pk",
    },
    ExpressionAttributeValues: {
      ":pk": `LOAN|${pkParam}`,
    },
    KeyConditionExpression: "#pk = :pk",
  };

  let foundItems = await dynamodbClient.query(findParams).promise();
  return foundItems.Items;
};

const getLoanAssignmentsBatch = async (pkParams) => {
  const requestItems = pkParams.map((pk) => ({
    pk: `LOAN|${pk}`,
    sk: "HOUSE|lexcom|BUCKET|bucket_gt_1",
  }));
  console.log("requestItems", requestItems);
  const findParams = {
    RequestItems: {
      [collectionHouseRecordsTable]: {
        Keys: requestItems,
      },
    },
  };

  let foundItems = await dynamodbClient.batchGet(findParams).promise();
  return foundItems.Responses[collectionHouseRecordsTable];
};

const updateLoanAssignments = async (assignment) => {
  const updateParams = {
    TableName: collectionHouseRecordsTable,
    Key: {
      pk: `${assignment["pk"]}`,
      sk: `${assignment["sk"]}`,
    },
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":status": assignment["status"],
    },
    UpdateExpression: "set #status = :status",
  };

  await dynamodbClient.update(updateParams).promise(); //new UpdateCommand(updateParams);
  return true;
};

(async () => {
  const pks = PROD_IDS;
  //   [
  //     "03ff071f-1272-4df1-aa23-6005dd98221d",
  //     "05f85607-50bd-45b5-ac37-ed53055e57a1",
  //     "178ddf15-084e-4200-bbc9-33594d350157",
  //   ];
  //   const data = await getLoanAssignmentsBatch(pks);
  //   console.log("data", data);
  for (let index = 0; index < pks.length; index++) {
    const pk = pks[index];
    console.log(`------ -------------`);
    console.log(`------ ${index} - pk`, pk);
    const loans = await getLoanAssignments(pk);
    console.log(`loans.length`, loans?.length);
    loans.forEach(async (loan) => {
      // console.log("loan", loan.status);
      //console.log("loan", loan);
      console.log("loan status", loan.status);
      if (loan.status === "active" || loan.status === "partial") {
        console.log("loan to update", loan.pk);
        const newData = { ...loan, status: "inactive" };
        await updateLoanAssignments(newData);
      }
    });
    console.log(`------ ${index} - pk`, pk);
  }
})();
