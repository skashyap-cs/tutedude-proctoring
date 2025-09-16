// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB connection (change URI if needed) ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proctoring';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log('MongoDB connected'))
  .catch(err=>console.error('MongoDB error', err));

// --- Models ---
// FileMeta (kept local here)
const FileMetaSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
  uploadAt: { type: Date, default: Date.now },
  candidateName: String,
  interviewId: String,
  path: String
});
const FileMeta = mongoose.models.FileMeta || mongoose.model('FileMeta', FileMetaSchema);

// Ensure EventLog model file exists at backend/models/EventLog.js
// That file should export the mongoose model (see note below).
// Here we require it so the model registers with mongoose.
const EventLog = require('./models/EventLog'); // should export mongoose.model('EventLog', schema)

// --- Multer storage ---
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const interviewId = req.body.interviewId || 'general';
    const dir = path.join(UPLOAD_ROOT, interviewId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

// --- Routes ---
// Health
app.get('/', (req, res) => res.json({ ok: true }));

// Upload recorded video
app.post('/upload/video', upload.single('video'), async (req, res) => {
  try {
    const { candidateName, interviewId } = req.body;
    const file = req.file;
    const meta = new FileMeta({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      candidateName,
      interviewId,
      path: file.path
    });
    await meta.save();
    return res.json({ success: true, meta });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Upload event log (JSON) from detection scripts or frontend
app.post('/logs/event', async (req, res) => {
  try {
    const payload = req.body;
    const log = new EventLog(payload);
    await log.save();
    return res.json({ success: true, log });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get logs for an interview
app.get('/logs/:interviewId', async (req, res) => {
  try {
    const logs = await EventLog.find({ interviewId: req.params.interviewId }).sort({ timestamp: 1 });
    res.json({ success: true, logs });
  } catch (err) {
    console.error('logs fetch err', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download uploaded video file
app.get('/uploads/:interviewId/:filename', (req, res) => {
  const dir = path.join(UPLOAD_ROOT, req.params.interviewId);
  res.sendFile(path.join(dir, req.params.filename));
});

// --- Report Routes ---
// make sure backend/routes/reportRoutes.js exists (paste the route code I gave earlier)
const reportRoutes = require('./routes/reportRoutes');
app.use('/reports', reportRoutes);

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log(`Server listening on ${PORT}`));

// export EventLog & app for optional require by other modules
module.exports = { EventLog, app };
