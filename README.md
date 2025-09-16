# Tutedude Proctoring

An AI-based proctoring system built with React (frontend) and Node.js + MongoDB (backend).  
This project detects cheating attempts in online interviews/exams using face detection, multiple face alerts, object detection, and event logging.

## Features
- Detects "No Face" (when candidate leaves the camera)
- Detects "Multiple Faces" (when more than one person appears in the frame)
- Detects restricted objects like phone, book, laptop
- Logs all proctoring events in MongoDB
- Records and uploads video for review
- Generates downloadable reports in PDF and CSV format

## Tech Stack
- **Frontend:** React, TensorFlow.js
- **Backend:** Node.js, Express.js, MongoDB, Mongoose
- **Libraries Used:** coco-ssd, face-landmarks-detection, multer

## Project Structure



## How to Run Locally

### Backend
```bash
cd backend
npm install
npm run dev

### Frontend
cd frontend
npm install
npm start
