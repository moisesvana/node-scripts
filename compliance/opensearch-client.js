/**
 * @typedef {import("@opensearch-project/opensearch").Client} Client
 */

import { Client } from "@opensearch-project/opensearch";

export class OpenSearchClient {
  /**
   * OpenSearchClient constructor
   * @param {string} nodeName
   * @param {Object} secrets
   * @param {string} secrets.username
   * @param {string} secrets.password
   */
  constructor(nodeName, secrets) {
    this.nodeName = nodeName;
    this.client = null;
    this.secrets = secrets;
  }

  async setClient() {
    const { username, password } = this.secrets;
    const client = new Client({
      node: this.nodeName,
      auth: {
        username: username,
        password: password,
      },
    });
    this.client = client;
  }

  async search(input) {
    const { index, queryInput } = input;

    await this.setClient();
    const searchResult = await this.client.search({
      index: index,
      body: queryInput,
    });

    const items = searchResult?.body?.hits?.hits?.map(
      (item) => item["_source"]
    );

    const response = {
      items: items,
      total: searchResult?.body?.hits?.total,
    };

    return response;
  }
}
