
UserPropertiesTable:
Type: AWS::DynamoDB::Table
DeletionPolicy: Retain
Properties:
    TableName:
    !Join [
        "",
        [
        "user_properties",
        !If [ProdEnvironment, "", !Sub "_${EnvironmentType}"],
        ],
    ]
    BillingMode: PAY_PER_REQUEST
    DeletionProtectionEnabled: true
    AttributeDefinitions:
    - AttributeName: pk
        AttributeType: S
    - AttributeName: sk
        AttributeType: S
    - AttributeName: search
        AttributeType: S
    - AttributeName: subsearch
        AttributeType: S
    KeySchema:
    - AttributeName: pk
        KeyType: HASH
    - AttributeName: sk
        KeyType: RANGE
    GlobalSecondaryIndexes:
    - IndexName: sk_index
        KeySchema:
        - AttributeName: sk
            KeyType: HASH
        - AttributeName: pk
            KeyType: RANGE
        Projection:
        ProjectionType: ALL
    - IndexName: search_subsearch_index
        KeySchema:
        - AttributeName: search
            KeyType: HASH
        - AttributeName: subsearch
            KeyType: RANGE
        Projection:
        ProjectionType: ALL



entity:

{
  "pk": "USER|wHmAb8Jyt67XJ4hb7effBv|NS|compliance",
  "sk": "USER|wHmAb8Jyt67XJ4hb7effBv",
  "created_at": "2025-04-02T20:12:02.344654832Z",
  "namespace": "compliance",
  "props": {
    "automatic_rejection": true,
    "loan_request_id": "-OhzuJANjLjeWoaKojlP",
    "risk_score": 32
  },
  "shown_id": "wHmAb8Jyt67XJ4hb7effBv|NS|compliance",
  "type": "NAMESPACE",
  "updated_at": "2026-01-02T18:12:54.776044284Z",
  "user_id": "wHmAb8Jyt67XJ4hb7effBv"
}