import { useEffect, useRef, memo } from 'react';

const Waveform = ({ data, color, height = 150, progress = 0 }) => {
    const waveCanvasRef = useRef(null);
    const progressCanvasRef = useRef(null);

    // Draw static waveform and handle resize
    useEffect(() => {
        if (!data || !waveCanvasRef.current) return;

        const canvas = waveCanvasRef.current;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement.getBoundingClientRect();
            if (rect.width === 0) return;

            const w = Math.floor(rect.width);
            const h = height;

            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);

            ctx.clearRect(0, 0, w, h);
            
            const step = Math.floor(data.length / w) || 1;
            const amp = h / 2;

            // Draw Waveform Envelope
            ctx.beginPath();
            
            // Draw top envelope
            for (let i = 0; i < w; i++) {
                const start = i * step;
                const end = Math.min(start + step, data.length);
                let max = -1;
                for (let j = start; j < end; j++) {
                    if (data[j] > max) max = data[j];
                }
                max = Math.min(Math.max(max, -1), 1);
                const y = amp - max * (amp * 0.9); // scale down slightly to avoid boundary touching
                if (i === 0) ctx.moveTo(i, y);
                else ctx.lineTo(i, y);
            }

            // Draw bottom envelope going backward
            for (let i = w - 1; i >= 0; i--) {
                const start = i * step;
                const end = Math.min(start + step, data.length);
                let min = 1;
                for (let j = start; j < end; j++) {
                    if (data[j] < min) min = data[j];
                }
                min = Math.min(Math.max(min, -1), 1);
                const y = amp - min * (amp * 0.9);
                ctx.lineTo(i, y);
            }
            
            ctx.closePath();

            // Fill with gorgeous semi-transparent gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, color);
            gradient.addColorStop(0.5, color + '40'); // 25% opacity
            gradient.addColorStop(1, color);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Add standard outline stroke on top of the envelope
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.25;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Glow effect
            ctx.globalAlpha = 0.3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.stroke();
        };

        draw();

        const resizeObserver = new ResizeObserver(() => {
            draw();
        });
        
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [data, color, height]);

    // Draw progress line and handle resize
    useEffect(() => {
        if (!progressCanvasRef.current) return;
        
        const canvas = progressCanvasRef.current;
        const ctx = canvas.getContext('2d');

        const drawProgress = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement.getBoundingClientRect();
            if (rect.width === 0) return;

            const w = Math.floor(rect.width);
            const h = height;

            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);

            ctx.clearRect(0, 0, w, h);

            if (progress > 0) {
                const x = w * progress;
                ctx.beginPath();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
                
                // Progress glow
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#fff';
                ctx.stroke();
            }
        };

        drawProgress();

        const resizeObserver = new ResizeObserver(() => {
            drawProgress();
        });
        
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [progress, height]);

    return (
        <div className="waveform-wrapper" style={{ position: 'relative', width: '100%', height: `${height}px` }}>
            <canvas 
                ref={waveCanvasRef} 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '12px' }} 
            />
            <canvas 
                ref={progressCanvasRef} 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} 
            />
        </div>
    );
};

export default memo(Waveform);
