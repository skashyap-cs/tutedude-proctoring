import React, { forwardRef } from 'react';

const VideoPlayer = forwardRef((props, ref) => {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        style={{ width: 640, height: 480, borderRadius: 6, background: '#000' }}
      />
      {/* optional overlay inside container (will be used by debug draw if present) */}
      <canvas
        id="face-debug-canvas"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 640,
          height: 480,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    </div>
  );
});

export default VideoPlayer;
