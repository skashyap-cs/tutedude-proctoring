import React from 'react';

export default function Navbar() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12
    }}>
      <div style={{ fontWeight: 700 }}>Tutedude</div>
      <div style={{ fontSize: 13, color: '#666' }}>Proctoring Demo</div>
    </div>
  );
}
