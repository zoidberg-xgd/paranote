/**
 * MongoDB Atlas Data API Adapter
 * 通过 HTTP 接口访问 MongoDB
 */

export class MongoAtlas {
  constructor(config) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.dataSource = config.dataSource;
    this.database = config.database;
    this.collection = config.collection;
  }

  async request(action, body = {}) {
    const endpoint = `${this.url}/action/${action}`;
    const payload = {
      dataSource: this.dataSource,
      database: this.database,
      collection: this.collection,
      ...body,
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`Atlas API Error: ${resp.status} ${await resp.text()}`);
    }

    return await resp.json();
  }

  async find(filter = {}, sort = {}, limit = 100) {
    const res = await this.request("find", {
      filter,
      sort,
      limit,
    });
    return res.documents;
  }

  async insertOne(document) {
    const res = await this.request("insertOne", { document });
    return { ...document, _id: res.insertedId };
  }

  async updateOne(filter, update, upsert = false) {
    return await this.request("updateOne", { filter, update, upsert });
  }

  async deleteOne(filter) {
    return await this.request("deleteOne", { filter });
  }
}
