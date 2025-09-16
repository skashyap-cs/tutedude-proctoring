// frontend/src/pages/InterviewPage.jsx
import React, { useRef, useState, useEffect } from 'react';
import VideoPlayer from '../components/VideoPlayer';
import AlertBox from '../components/AlertBox';
import Navbar from '../components/Navbar';
import api from '../services/api';

// TensorFlow models
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import { createDetector, SupportedModels } from '@tensorflow-models/face-landmarks-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export default function InterviewPage() {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [interviewId] = useState('interview-' + Date.now());
  const [candidateName, setCandidateName] = useState('Sameer Kashyap');
  const [status, setStatus] = useState('idle');
  const [alerts, setAlerts] = useState([]);

  // detection models / counters
  const modelsRef = useRef({ faceModel: null, objModel: null });
  const detectionRef = useRef({
    noFaceCounter: 0,
    lookAwayCounter: 0,
    lastFaceCount: 0,
    multipleFaceCounter: 0
  });

  // thresholds
  const NO_FACE_THRESHOLD_SEC = 10;
  const LOOKAWAY_THRESHOLD_SEC = 5;
  const FACE_CHECK_INTERVAL_MS = 300;
  const OBJECT_DETECT_INTERVAL_MS = 5000;

  // debug & detection tuning (put here so runFaceCheck/drawDetections can access)
  const DEBUG_DRAW = true; // set false to disable overlay drawing
  const DEBUG_CANVAS_ID = 'face-debug-canvas';
  const MIN_FACE_CONFIDENCE = 0.45;
  const MIN_FACE_AREA_FRAC = 0.03; // face area fraction of frame (ignore tiny faces)
  const MULTIPLE_FACE_CONSECUTIVE = 3; // how many consecutive frames to confirm multiple faces

  // ---------------------------
  // Helper: draw detections overlay
  // ---------------------------
  function drawDetections(canvasEl, detections = []) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    detections.forEach(pred => {
      let bbox = null;
      if (pred.boundingBox && pred.boundingBox.topLeft && pred.boundingBox.bottomRight) {
        const [x1, y1] = pred.boundingBox.topLeft;
        const [x2, y2] = pred.boundingBox.bottomRight;
        bbox = { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
      } else if (pred.box && pred.box.length >= 4) {
        bbox = { left: pred.box[0], top: pred.box[1], width: pred.box[2], height: pred.box[3] };
      } else if (pred.keypoints && pred.keypoints.length) {
        const xs = pred.keypoints.map(k => k.x || 0);
        const ys = pred.keypoints.map(k => k.y || 0);
        const left = Math.min(...xs), right = Math.max(...xs);
        const top = Math.min(...ys), bottom = Math.max(...ys);
        bbox = { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      }

      if (bbox) {
        ctx.strokeStyle = 'rgba(255, 99, 71, 0.95)'; // tomato
        ctx.lineWidth = 3;
        ctx.strokeRect(bbox.left, bbox.top, bbox.width, bbox.height);

        ctx.fillStyle = 'rgba(255,99,71,0.9)';
        ctx.font = '14px sans-serif';
        const label = (pred.score != null) ? `s:${(pred.score || 0).toFixed(2)}` : '';
        ctx.fillText(label, Math.max(0, bbox.left), Math.max(12, bbox.top - 6));
      }

      if (pred.keypoints && pred.keypoints.length) {
        ctx.fillStyle = 'rgba(0,200,120,0.9)';
        for (const p of pred.keypoints.slice(0, 30)) {
          const x = p.x || 0;
          const y = p.y || 0;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  // ---------------------------
  // Improved face-check function
  // ---------------------------
  async function runFaceCheck() {
    const faceModel = modelsRef.current.faceModel;
    const v = videoRef.current;
    if (!faceModel || !v || v.readyState < 2) return;
    try {
      // prepare canvas same size as video (model coords)
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 640;
      canvas.height = v.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

      const predictions = await faceModel.estimateFaces(canvas, { flipHorizontal: false });
      const rawCount = (predictions && predictions.length) || 0;
      const frameArea = canvas.width * canvas.height;

      // filter out tiny/low-confidence detections
      const goodFaces = (predictions || []).filter(pred => {
        let bbox = null;
        if (pred.boundingBox && pred.boundingBox.topLeft && pred.boundingBox.bottomRight) {
          const [x1, y1] = pred.boundingBox.topLeft;
          const [x2, y2] = pred.boundingBox.bottomRight;
          bbox = { width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
        } else if (pred.box && pred.box.length >= 4) {
          bbox = { width: Math.max(0, pred.box[2]), height: Math.max(0, pred.box[3]) };
        } else if (pred.keypoints && pred.keypoints.length) {
          const xs = pred.keypoints.map(k => k.x || 0);
          const ys = pred.keypoints.map(k => k.y || 0);
          const left = Math.min(...xs), right = Math.max(...xs);
          const top = Math.min(...ys), bottom = Math.max(...ys);
          bbox = { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
        }
        if (!bbox) return false;
        const areaFrac = (bbox.width * bbox.height) / frameArea;
        if (areaFrac < MIN_FACE_AREA_FRAC) return false;
        const score = (pred.score ?? pred.probability ?? null);
        if (score != null && score < MIN_FACE_CONFIDENCE) return false;
        return true;
      });

      const faceCountGood = goodFaces.length;

      // NO-FACE debounce (use rawCount)
      if (rawCount === 0) detectionRef.current.noFaceCounter += 1;
      else detectionRef.current.noFaceCounter = 0;

      // MULTI-FACE debounce (use goodFaces)
      if (faceCountGood > 1) {
        detectionRef.current.multipleFaceCounter = (detectionRef.current.multipleFaceCounter || 0) + 1;
        if (detectionRef.current.multipleFaceCounter >= MULTIPLE_FACE_CONSECUTIVE) {
          detectionRef.current.multipleFaceCounter = 0;
          await raiseEvent('multiple_faces', { count: faceCountGood });
        }
      } else {
        detectionRef.current.multipleFaceCounter = 0;
      }

      // LOOK-AWAY: based on primary good face's center
      if (goodFaces[0]) {
        let cx = null;
        const face = goodFaces[0];
        if (face.boundingBox && face.boundingBox.topLeft && face.boundingBox.bottomRight) {
          const left = face.boundingBox.topLeft[0];
          const right = face.boundingBox.bottomRight[0];
          cx = (left + right) / 2;
        } else if (face.keypoints && face.keypoints.length) {
          const xs = face.keypoints.map(k => k.x || 0);
          cx = xs.reduce((a, b) => a + b, 0) / xs.length;
        } else if (face.box && face.box.length >= 3) {
          cx = face.box[0] + (face.box[2] / 2);
        }

        if (cx !== null) {
          const frameCx = canvas.width / 2;
          const offset = Math.abs(cx - frameCx) / frameCx;
          if (offset > 0.45) detectionRef.current.lookAwayCounter += 1;
          else detectionRef.current.lookAwayCounter = 0;
        } else {
          detectionRef.current.lookAwayCounter = 0;
        }
      } else {
        detectionRef.current.lookAwayCounter = 0;
      }

      // FIRE NO-FACE if debounced exceeded
      const noFaceSec = detectionRef.current.noFaceCounter * (FACE_CHECK_INTERVAL_MS / 1000);
      if (noFaceSec > NO_FACE_THRESHOLD_SEC) {
        detectionRef.current.noFaceCounter = 0;
        await raiseEvent('no_face', { duration_seconds: Math.round(noFaceSec) });
      }

      // FIRE LOOK-AWAY if debounced exceeded
      const lookAwaySec = detectionRef.current.lookAwayCounter * (FACE_CHECK_INTERVAL_MS / 1000);
      if (lookAwaySec > LOOKAWAY_THRESHOLD_SEC) {
        detectionRef.current.lookAwayCounter = 0;
        await raiseEvent('look_away', { duration_seconds: Math.round(lookAwaySec) });
      }

      detectionRef.current.lastFaceCount = rawCount;

      // DEBUG overlay
      if (DEBUG_DRAW) {
        let overlay = document.getElementById(DEBUG_CANVAS_ID);
        if (!overlay) {
          overlay = document.createElement('canvas');
          overlay.id = DEBUG_CANVAS_ID;
          overlay.style.position = 'absolute';
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = 9998;
          document.body.appendChild(overlay);
        }

        // position overlay over video element
        const rect = v.getBoundingClientRect();
        overlay.style.left = rect.left + 'px';
        overlay.style.top = rect.top + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        // set canvas to model coords and draw predictions
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        drawDetections(overlay, predictions || []);
      }
    } catch (err) {
      console.warn('faceCheck err', err);
    }
  }

  // ---------------------------
  // Object check (coco-ssd)
  // ---------------------------
  async function runObjectCheck() {
    const objModel = modelsRef.current.objModel;
    const v = videoRef.current;
    if (!objModel || !v || v.readyState < 2) return;
    try {
      const canvas = document.createElement('canvas');
      const W = 640, H = 480;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, W, H);

      const predictions = await objModel.detect(canvas);
      const FLAG = new Set(['cell phone', 'cellphone', 'phone', 'laptop', 'book', 'keyboard', 'remote']);
      for (const p of predictions) {
        const cls = (p.class || '').toLowerCase();
        const conf = p.score || p.confidence || 0;
        if (FLAG.has(cls) && conf > 0.35) {
          await raiseEvent('object_detected', { object: cls, confidence: Math.round(conf * 100) / 100 });
        }
      }
    } catch (err) {
      console.warn('objectCheck err', err);
    }
  }

  // ---------------------------
  // model loading
  // ---------------------------
  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        setStatus('loading models...');
        await tf.setBackend('webgl');

        // face detector (MediaPipe Face Mesh)
        const faceModel = await createDetector(SupportedModels.MediaPipeFaceMesh, {
          runtime: 'tfjs',
          maxFaces: 2
        });

        // object detector
        const objModel = await cocoSsd.load();

        if (!mounted) return;
        modelsRef.current.faceModel = faceModel;
        modelsRef.current.objModel = objModel;
        setStatus('models loaded');
      } catch (err) {
        console.error('model load error', err);
        setStatus('model load error');
        pushAlert('error', 'Model load failed', String(err?.message || err));
      }
    }
    loadModels();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // detection loops
  useEffect(() => {
    let faceInterval = null;
    let objInterval = null;
    if (videoRef.current) {
      faceInterval = setInterval(runFaceCheck, FACE_CHECK_INTERVAL_MS);
      objInterval = setInterval(runObjectCheck, OBJECT_DETECT_INTERVAL_MS);
    }
    return () => {
      clearInterval(faceInterval);
      clearInterval(objInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef.current]);

  // ---------------------------
  // camera + recorder + upload
  // ---------------------------
  async function startCameraAndRecorder() {
    try {
      setStatus('accessing camera...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = async () => {
        setStatus('processing video...');
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        chunksRef.current = [];
        try {
          setStatus('uploading video...');
          await api.uploadVideo(blob, interviewId, candidateName);
          setStatus('video uploaded');
          pushAlert('info', 'Video uploaded', null);
        } catch (err) {
          console.error(err);
          setStatus('upload failed');
          pushAlert('error', 'Video upload failed', String(err?.message || err));
        }
      };
      setStatus('ready');
    } catch (err) {
      console.error('camera error', err);
      setStatus('camera error: ' + (err.message || err));
      pushAlert('error', 'Camera access error', String(err?.message || err));
    }
  }

  async function handleStart() {
    if (!videoRef.current.srcObject) await startCameraAndRecorder();
    mediaRecorderRef.current.start(1000);
    setRecording(true);
    setStatus('recording');
    // kick detection quickly
    setTimeout(runFaceCheck, 100);
    setTimeout(runObjectCheck, 500);
  }

  function handleStop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setStatus('stopped');
  }

  // ---------------------------
  // UI alerts + sound
  // ---------------------------
  function playSound(level) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = level === 'error' ? 'sawtooth' : (level === 'warn' ? 'square' : 'sine');
      o.frequency.value = level === 'error' ? 420 : 660;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, 500);
    } catch (e) { /* some browsers require gesture to create AudioContext */ }
  }

  function pushAlert(level, message, details = null) {
    const id = Date.now() + '-' + Math.floor(Math.random() * 1000);
    const item = { id, level, message, details, ts: new Date().toISOString() };
    setAlerts(prev => [item, ...prev].slice(0, 6));
    playSound(level);
  }

  // send event to backend and show alert
  async function raiseEvent(type, details) {
    const ev = { interviewId, candidateName, eventType: type, details, timestamp: new Date().toISOString() };
    try { api.postEvent(ev).catch(err => console.warn('postEvent failed', err)); } catch (e) {}
    const msg = type === 'no_face' ? `No face detected (${details.duration_seconds}s)` :
                type === 'look_away' ? `Looking away (${details.duration_seconds}s)` :
                type === 'multiple_faces' ? `Multiple faces detected (${details.count})` :
                type === 'object_detected' ? `Object: ${details.object} (${details.confidence})` :
                `${type}`;
    const level = type === 'object_detected' ? 'warn' : 'error';
    pushAlert(level, msg, details);
  }

  // ---------------------------
  // Download report helper
  // ---------------------------
  async function handleDownloadReport(format = 'pdf') {
    try {
      const res = await api.downloadReport(interviewId, format);
      if (!res.ok) {
        const txt = await res.json().catch(()=>({ message: res.statusText }));
        pushAlert('error', 'Failed to download report', txt?.message || res.statusText);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${interviewId}-report.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      pushAlert('info', 'Report downloaded', { format });
    } catch (err) {
      console.error('download report error', err);
      pushAlert('error', 'Failed to download report', String(err?.message || err));
    }
  }

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <div>
      <Navbar />
      <AlertBox>{status === 'idle' ? 'Ready to start' : status}</AlertBox>

      <div style={{ marginBottom: 8, maxWidth: 760, marginLeft: 24 }}>
        <label style={{ marginRight: 8, color: '#cfe7ff' }}>Candidate name:</label>
        <input value={candidateName} onChange={(e)=>setCandidateName(e.target.value)} style={{ padding: '4px 6px' }} />
      </div>

      <div style={{ maxWidth: 760, marginLeft: 24 }}>
        <VideoPlayer ref={videoRef} />
      </div>

      <div style={{ marginTop: 10, marginLeft: 24 }}>
        {!recording
          ? <button onClick={handleStart} style={{ padding: '8px 14px', marginRight: 8 }}>Start Recording</button>
          : <button onClick={handleStop} style={{ padding: '8px 14px', marginRight: 8 }}>Stop Recording</button>}
        <button onClick={() => { navigator.clipboard?.writeText(interviewId); alert('Interview ID copied'); }} style={{ padding: '8px 10px' }}>
          Copy Interview ID
        </button>
        <button onClick={() => handleDownloadReport('pdf')} style={{ padding: '8px 10px', marginLeft: 8 }}>Download PDF</button>
        <button onClick={() => handleDownloadReport('csv')} style={{ padding: '8px 10px', marginLeft: 8 }}>Download CSV</button>
      </div>

      <p style={{ marginTop: 12, color: '#99a' , marginLeft: 24}}>Interview ID: <b>{interviewId}</b></p>

      {/* Alerts list - improved style for visibility */}
      <div style={{
        position: 'fixed',
        right: 20,
        top: 80,
        width: 360,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {alerts.map(a => {
          let bg = '#e6f7ff', border = '#1890ff', color = '#003a8c', icon = 'ℹ️';
          if (a.level === 'warn') {
            bg = '#fff3cd'; border = '#d39e00'; color = '#856404'; icon = '⚠️';
          } else if (a.level === 'error') {
            bg = '#f8d7da'; border = '#dc3545'; color = '#721c24'; icon = '❌';
          }

          return (
            <div key={a.id} style={{
              background: bg,
              borderLeft: `6px solid ${border}`,
              padding: '12px 14px',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideIn 240ms ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color, fontSize: 14 }}>
                  {icon} {a.message}
                </div>
                <div style={{ fontSize: 11, color: '#444', marginLeft: 10 }}>
                  {new Date(a.ts).toLocaleTimeString()}
                </div>
              </div>

              {a.details && (
                <div style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#333',
                  background: 'rgba(255,255,255,0.6)',
                  padding: '6px 8px',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {typeof a.details === 'object' ? JSON.stringify(a.details, null, 2) : a.details}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
