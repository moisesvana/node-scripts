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
