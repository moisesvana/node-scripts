import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import humps from "humps";

const EVENT_SOURCE = "vana.scripts.service";

const client = new EventBridgeClient({});

export class EventBusClient {
  async putEvent(detailType, detail) {
    const input = {
      Entries: [
        {
          Detail: JSON.stringify(humps.decamelizeKeys(detail)),
          DetailType: detailType,
          EventBusName: "vana",
          Source: EVENT_SOURCE,
        },
      ],
    };
    let result;
    try {
      const command = new PutEventsCommand(input);
      result = await client.send(command);
      if (result.FailedEntryCount > 0) {
        console.error(JSON.stringify(result));
      }
    } catch (error) {
      throw error;
    }
    return result;
  }
}
