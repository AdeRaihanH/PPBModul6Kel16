import { ReadingsModel } from "../models/readingsModel.js";

// Accepts ?since=<ISO date>&page=<n>&pageSize=<n>. Invalid values fall back to
// defaults in the model rather than erroring: a malformed filter should not
// break the screen.
function rangeFrom(req) {
  return {
    since: req.query.since,
    page: req.query.page,
    pageSize: req.query.pageSize,
  };
}

export const ReadingsController = {
  async list(req, res) {
    try {
      const data = await ReadingsModel.list(rangeFrom(req));
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async latest(req, res) {
    try {
      const data = await ReadingsModel.latest();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req, res) {
    try {
      const { reading, duplicate } = await ReadingsModel.create(req.body);
      // 201 for a new alarm, 200 for a retry that was already stored. The writer
      // treats both as success; the distinction is for logs and for tests.
      res.status(duplicate ? 200 : 201).json({ ...reading, duplicate });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
