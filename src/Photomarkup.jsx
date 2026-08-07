// ─── PhotoMarkup ──────────────────────────────────────────────────────────────
// Reusable full-screen markup editor: draw freehand on a photo (pen colour +
// width, undo, clear), then Save flattens it to a new JPEG data URL. Used by
// notifications and by checklist photo / markup fields.
//
// Props: src (data URL or image URL), onSave(dataUrl), onCancel()

import { useRef, useEffect, useState } from "react";

const COLOURS = ["#ff2d2d", "#ffd21e", "#22c55e", "#3b9dff", "#ffffff", "#111111"];
const WIDTHS = [4, 8, 14];

export default function PhotoMarkup({ src, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const strokesRef = useRef([]);      // [{colour,width,points:[{x,y}]}]
  const drawingRef = useRef(null);
  const [colour, setColour] = useState(COLOURS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [ready, setReady] = useState(false);
  const [, force] = useState(0);

  // Load image, size canvas to it (capped), initial draw.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cap = 1400;
      let w = img.naturalWidth || 800, h = img.naturalHeight || 600;
      if (w > cap || h > cap) { const s = cap / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = canvasRef.current; if (!c) return;
      c.width = w; c.height = h;
      imgRef.current = img;
      redraw();
      setReady(true);
    };
    img.onerror = () => setReady(true);
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const redraw = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, c.width, c.height);
    for (const st of strokesRef.current) drawStroke(ctx, st);
    if (drawingRef.current) drawStroke(ctx, drawingRef.current);
  };

  const drawStroke = (ctx, st) => {
    if (!st.points.length) return;
    ctx.strokeStyle = st.colour; ctx.lineWidth = st.width;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(st.points[0].x, st.points[0].y);
    for (let i = 1; i < st.points.length; i++) ctx.lineTo(st.points[i].x, st.points[i].y);
    ctx.stroke();
  };

  const posFromEvent = (e) => {
    const c = canvasRef.current; const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width, sy = c.height / rect.height;
    const pt = e.touches ? e.touches[0] : e;
    return { x: (pt.clientX - rect.left) * sx, y: (pt.clientY - rect.top) * sy };
  };

  const start = (e) => { e.preventDefault(); drawingRef.current = { colour, width, points: [posFromEvent(e)] }; };
  const move = (e) => { if (!drawingRef.current) return; e.preventDefault(); drawingRef.current.points.push(posFromEvent(e)); redraw(); };
  const end = (e) => { if (!drawingRef.current) return; e.preventDefault(); if (drawingRef.current.points.length) strokesRef.current.push(drawingRef.current); drawingRef.current = null; redraw(); };

  const undo = () => { strokesRef.current.pop(); redraw(); force(n => n + 1); };
  const clearAll = () => { strokesRef.current = []; redraw(); force(n => n + 1); };
  const save = () => {
    const c = canvasRef.current; if (!c) return;
    onSave(c.toDataURL("image/jpeg", 0.8));
  };

  return (
    <div className="mk-backdrop">
      <div className="mk-panel">
        <div className="mk-toolbar">
          <div className="mk-colours">
            {COLOURS.map(cl => <button key={cl} className={`mk-swatch${colour === cl ? " on" : ""}`} style={{ background: cl }} onClick={() => setColour(cl)} />)}
          </div>
          <div className="mk-widths">
            {WIDTHS.map(w => <button key={w} className={`mk-width${width === w ? " on" : ""}`} onClick={() => setWidth(w)}><span style={{ width: w, height: w }} /></button>)}
          </div>
          <div className="mk-tools">
            <button className="mk-btn" onClick={undo} disabled={!strokesRef.current.length}>↺ Undo</button>
            <button className="mk-btn" onClick={clearAll} disabled={!strokesRef.current.length}>Clear</button>
          </div>
        </div>
        <div className="mk-canvas-wrap">
          {!ready && <div className="mk-loading">Loading photo…</div>}
          <canvas ref={canvasRef} className="mk-canvas"
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        </div>
        <div className="mk-actions">
          <button className="mk-btn mk-cancel" onClick={onCancel}>Cancel</button>
          <button className="mk-btn mk-save" onClick={save}>✓ Save markup</button>
        </div>
      </div>
    </div>
  );
}
