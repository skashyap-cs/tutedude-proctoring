// frontend/src/components/AlertBox.jsx
import React from 'react';

export default function AlertBox({ children, type = 'info' }) {
  const bg = type === 'error' ? '#2b0000' : (type === 'warn' ? '#3f2a00' : '#002b3f');
  const color = type === 'error' ? '#ffd6d6' : (type === 'warn' ? '#ffefcc' : '#cfefff');
  return (
    <div style={{
      background: bg,
      color,
      borderRadius: 8,
      padding: '12px 14px',
      border: `1px solid rgba(255,255,255,0.06)`,
      boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
      marginBottom: 8,
      fontSize: 13
    }}>
      {children}
    </div>
  );
}
