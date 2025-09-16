// frontend/src/services/api.js
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

async function uploadVideo(blob, interviewId, candidateName) {
  const fd = new FormData();
  fd.append('video', blob, `${interviewId}.webm`);
  fd.append('interviewId', interviewId);
  fd.append('candidateName', candidateName);
  const res = await fetch(`${BASE_URL}/upload/video`, { method: 'POST', body: fd });
  return res.json();
}

async function uploadFrame(blob, interviewId, candidateName) {
  const fd = new FormData();
  fd.append('video', blob, `${Date.now()}-frame.jpg`);
  fd.append('interviewId', interviewId);
  fd.append('candidateName', candidateName);
  const res = await fetch(`${BASE_URL}/upload/video`, { method: 'POST', body: fd });
  return res.json();
}

async function postEvent(event) {
  const res = await fetch(`${BASE_URL}/logs/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  try {
    return await res.json();
  } catch (e) {
    return { ok: res.ok };
  }
}

function downloadReport(interviewId, format = 'pdf') {
  const url = `${BASE_URL}/reports/download/${encodeURIComponent(interviewId)}?format=${encodeURIComponent(format)}`;
  return fetch(url);
}

/**
 * Named const export to satisfy ESLint rule:
 * import/no-anonymous-default-export (assign object to variable before exporting)
 */
const api = {
  uploadVideo,
  uploadFrame,
  postEvent,
  downloadReport
};

export default api;
