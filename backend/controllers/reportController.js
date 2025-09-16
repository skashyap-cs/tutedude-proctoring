// backend/controllers/reportController.js
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');
const EventLog = require('../models/EventLog');

async function generateCSV(events) {
  const fields = ['timestamp','eventType','details','candidateName','interviewId'];
  const parser = new Parser({ fields });
  const flat = events.map(e => ({
    timestamp: e.timestamp,
    eventType: e.eventType,
    details: typeof e.details === 'object' ? JSON.stringify(e.details) : e.details,
    candidateName: e.candidateName || '',
    interviewId: e.interviewId || ''
  }));
  return parser.parse(flat);
}

async function generatePDFBuffer(events, meta = {}) {
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => {});
  doc.fontSize(18).text('Proctoring Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Interview ID: ${meta.interviewId || ''}`);
  doc.text(`Candidate: ${meta.candidateName || ''}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown(0.8);

  doc.fontSize(11);
  events.forEach((e, idx) => {
    const time = new Date(e.timestamp).toLocaleString();
    const type = e.eventType;
    const details = typeof e.details === 'object' ? JSON.stringify(e.details) : e.details;
    doc.text(`${idx+1}. [${time}] ${type} — ${details}`);
  });

  doc.end();
  return Buffer.concat(chunks);
}

exports.downloadReport = async (req, res) => {
  try {
    const interviewId = req.params.interviewId;
    const format = (req.query.format || 'csv').toLowerCase();

    if (!interviewId) return res.status(400).json({ ok:false, message:'interviewId required' });

    const events = await EventLog.find({ interviewId }).sort({ timestamp: 1 }).lean();

    if (!events || events.length === 0) {
      return res.status(404).json({ ok:false, message: 'No events found for interviewId' });
    }

    const meta = { interviewId, candidateName: events[0].candidateName || '' };

    if (format === 'csv') {
      const csv = await generateCSV(events);
      res.setHeader('Content-disposition', `attachment; filename=${interviewId}-report.csv`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    } else if (format === 'pdf') {
      const pdfBuf = await generatePDFBuffer(events, meta);
      res.setHeader('Content-disposition', `attachment; filename=${interviewId}-report.pdf`);
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(pdfBuf);
    } else {
      return res.status(400).json({ ok:false, message:'Invalid format, use csv or pdf' });
    }
  } catch (err) {
    console.error('downloadReport err', err);
    return res.status(500).json({ ok:false, message: 'Server error', error: err.message });
  }
};
