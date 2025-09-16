import React from 'react';
import InterviewPage from './pages/InterviewPage';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <div className="proctor-card">
        <InterviewPage />
      </div>
    </div>
  );
}
