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
      total: searchResult?.body?.hits?.total?.value,
    };

    if (searchResult.body.aggregations) {
      const aggregationsFormatted = formatAggregations(
        searchResult.body.aggregations
      );
      Object.assign(response, { aggregations: aggregationsFormatted });
    }
    return response;
  }

  async deleteDocument(input) {
    const { index, id } = input;

    await this.setClient();
    const deleteResult = await this.client.delete({
      index: index,
      id: id,
    });

    return {
      success: deleteResult?.body?.result === "deleted",
      result: deleteResult?.body?.result,
    };
  }

  async updateIntentStatus(input) {
    const { index, id, intentStatus } = input;

    await this.setClient();
    const updateResult = await this.client.update({
      index: index,
      id: id,
      body: {
        doc: {
          intent_status: intentStatus,
        },
      },
    });

    return {
      success: updateResult?.body?.result === "updated",
      result: updateResult?.body?.result,
    };
  }

  async updateDocument(input) {
    const { index, id, doc } = input;

    await this.setClient();
    const updateResult = await this.client.update({
      index: index,
      id: id,
      body: {
        doc: doc,
      },
    });

    return {
      success: updateResult?.body?.result === "updated" || updateResult?.body?.result === "noop",
      result: updateResult?.body?.result,
    };
  }
}

const formatAggregations = (aggs) => {
  const formattedResponse = {};
  for (const key in aggs) {
    if (aggs[key]) {
      const agg = aggs[key];
      if (agg.buckets) {
        const formattedBuckets = {};
        for (const bucket of agg.buckets) {
          formattedBuckets[bucket.key.toLowerCase()] = bucket.doc_count;
        }
        formattedResponse[key] = formattedBuckets;
      } else if (agg.grouped_by && agg.grouped_by.buckets) {
        formattedResponse[key] = {};
        for (const bucket of agg.grouped_by.buckets) {
          formattedResponse[key][bucket.key.toLowerCase()] = bucket.doc_count;
        }
      }
    }
  }

  return formattedResponse;
};
