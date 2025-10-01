import mongoose from "mongoose";

const LogSchema = new mongoose.Schema({
  traceId: {
    type: String,
    required: true,
  },
  method: {
    type: String,
    required: true,
  },
  endpoint: {
    type: String,
    required: true,
  },
  status: {
    type: Number,
    required: true,
  },
  responseTimeMs: {
    type: Number,
    required: true,
  },
  logs: [
    {
      timestamp: { type: Date },
      type: { type: String },
      method: { type: String },
      endpoint: { type: String },
      message: { type: String },
    },
  ],
});

const logData = mongoose.model("logData", LogSchema);
export default logData;