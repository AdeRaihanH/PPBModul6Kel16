import { ThresholdsModel } from "../models/thresholdsModel.js";

// Accepts ?since=<ISO date>&limit=<n>. Invalid values fall back to defaults in
// the model rather than erroring: a malformed filter should not break the screen.
function rangeFrom(req) {
  return { since: req.query.since, limit: req.query.limit };
}
export const ThresholdsController = {
  async list(req, res) {
    try {
      const data = await ThresholdsModel.list(rangeFrom(req));
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async latest(req, res) {
    try {
      const data = await ThresholdsModel.latest();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req, res) {
    try {
      const created = await ThresholdsModel.create(req.body);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};
