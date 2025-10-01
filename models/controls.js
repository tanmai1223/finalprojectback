import mongoose from "mongoose";

const ControlSchema = new mongoose.Schema({
  endpoint: {
    type: String,
    required: true,
    unique: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  limitValues: {
    number: { type: Number, default: null },
    rate: { type: Number, default: null },
  },
  scheduleValues: {
    start: { type: String, default: null },
    end: { type: String, default: null },
  },
  toggles: {
    api: { type: Boolean, default: true },
    tracer: { type: Boolean, default: true },
    schedule: { type: Boolean, default: false },
    limit: { type: Boolean, default: false },
  },
});

const Control = mongoose.model("Control", ControlSchema);

export default Control;