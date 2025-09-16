// backend/models/EventLog.js
const mongoose = require('mongoose');

const EventLogSchema = new mongoose.Schema({
  interviewId: { type: String, index: true },
  candidateName: String,
  eventType: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.models.EventLog || mongoose.model('EventLog', EventLogSchema);
