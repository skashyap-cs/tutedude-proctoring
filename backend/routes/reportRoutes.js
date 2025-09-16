// backend/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');

// Ensure model is registered
const EventLog = mongoose.models.EventLog || require('../models/EventLog');

/**
 * Helper: convert event list to CSV string
 */
function eventsToCsv(events) {
  const header = ['timestamp','eventType','candidateName','details'];
  const rows = events.map(ev => {
    const details = (ev.details && typeof ev.details === 'object') ? JSON.stringify(ev.details) : (ev.details || '');
    const safeDetails = String(details).replace(/"/g, '""');
    return [
      `"${(new Date(ev.timestamp)).toISOString()}"`,
      `"${(ev.eventType || '')}"`,
      `"${(ev.candidateName || '')}"`,
      `"${safeDetails}"`
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

/**
 * GET /reports/events/:interviewId
 * Return raw events JSON for the interview (sorted by timestamp).
 */
router.get('/events/:interviewId', async (req, res) => {
  try {
    const { interviewId } = req.params;
    const logs = await EventLog.find({ interviewId }).sort({ timestamp: 1 }).lean();
    return res.json({ success: true, logs });
  } catch (err) {
    console.error('reports/events error', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /reports/download/:interviewId?format=pdf|csv
 * Download report as PDF (default) or CSV.
 */
router.get('/download/:interviewId', async (req, res) => {
  try {
    const interviewId = req.params.interviewId;
    const format = (req.query.format || 'pdf').toLowerCase();

    const events = await EventLog.find({ interviewId }).sort({ timestamp: 1 }).lean();

    if (!events || events.length === 0) {
      return res.status(404).json({ success: false, message: `No events found for ${interviewId}` });
    }

    if (format === 'csv') {
      const csv = eventsToCsv(events);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${interviewId}-report.csv"`);
      return res.send(csv);
    }

    // PDF generation
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${interviewId}-report.pdf"`);
      res.send(result);
    });

    // Build PDF content
    doc.addPage({ size: 'A4', margin: 40 });
    doc.fontSize(18).fillColor('#000').text('Interview Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#444').text(`Interview ID: ${interviewId}`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#444').text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    events.forEach((ev, idx) => {
      const timeText = ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '';
      doc.fontSize(11).fillColor('#000').text(`${idx + 1}. ${ev.eventType || 'event'} — ${timeText}`);
      doc.fontSize(10).fillColor('#333').text(`Candidate: ${ev.candidateName || ''}`);
      const detailsText = (ev.details && typeof ev.details === 'object')
        ? JSON.stringify(ev.details, null, 2)
        : String(ev.details || '');
      doc.fontSize(10).fillColor('#333').text(`Details: ${detailsText}`);
      doc.moveDown(0.5);

      // page break if long
      if ((idx + 1) % 28 === 0) doc.addPage();
    });

    doc.end();
  } catch (err) {
    console.error('reportRoutes error', err);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: String(err?.message || err) });
  }
});

module.exports = router;
