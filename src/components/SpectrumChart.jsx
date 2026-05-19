import { useEffect, useRef, memo } from 'react';

const SpectrumChart = ({ analysis }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !analysis) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) return;

            canvas.width = rect.width * dpr;
            canvas.height = 100 * dpr;
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = 100;

            ctx.clearRect(0, 0, w, h);

            const fMin = 40;
            const fMax = 12000;
            
            const numPoints = 120;
            const points = [];

            // Downsample using logarithmic frequency bands
            for (let i = 0; i < numPoints; i++) {
                const ratio = i / (numPoints - 1);
                const freq = fMin * Math.pow(fMax / fMin, ratio);
                
                const targetK = Math.round((freq * analysis.nSize) / analysis.sampleRate);
                
                const nextFreq = fMin * Math.pow(fMax / fMin, (i + 1) / (numPoints - 1));
                const nextK = Math.round((nextFreq * analysis.nSize) / analysis.sampleRate);
                
                const startK = Math.max(0, targetK);
                const endK = Math.min(analysis.coefficients.length - 1, Math.max(targetK + 1, nextK));
                
                let maxMag = 0;
                for (let k = startK; k < endK; k++) {
                    if (analysis.coefficients[k].mag > maxMag) {
                        maxMag = analysis.coefficients[k].mag;
                    }
                }
                points.push({ freq, mag: maxMag });
            }

            const maxPointMag = Math.max(...points.map(p => p.mag)) || 1;

            // Draw horizontal gridlines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.lineWidth = 1;
            for (let y = 15; y < h - 15; y += 20) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Draw Frequency Label Markers with vertical gridlines at precise logarithmic coordinates
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';

            const markers = [100, 500, 1000, 2000, 5000, 10000];
            markers.forEach(freq => {
                const ratio = Math.log(freq / fMin) / Math.log(fMax / fMin);
                if (ratio >= 0 && ratio <= 1) {
                    const x = ratio * w;
                    ctx.fillText(`${freq >= 1000 ? (freq / 1000) + 'k' : freq}Hz`, x, h - 3);

                    // Dotted vertical gridline
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
                    ctx.setLineDash([2, 3]);
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h - 15);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset dash
                }
            });

            // Draw frequency area curve
            ctx.beginPath();
            ctx.moveTo(0, h - 15);

            for (let i = 0; i < numPoints; i++) {
                const p = points[i];
                const x = (i / (numPoints - 1)) * w;
                // Apply non-linear scaling (square root) to boost visibility of smaller harmonics
                const normMag = Math.sqrt(p.mag / maxPointMag);
                const y = h - 15 - normMag * (h * 0.7);
                ctx.lineTo(x, y);
            }

            ctx.lineTo(w, h - 15);
            ctx.closePath();

            // Glowing gradient fill
            const fillGrad = ctx.createLinearGradient(0, 0, 0, h - 15);
            fillGrad.addColorStop(0, 'rgba(0, 210, 255, 0.25)');
            fillGrad.addColorStop(1, 'rgba(0, 210, 255, 0.0)');
            ctx.fillStyle = fillGrad;
            ctx.fill();

            // Stroke line
            ctx.beginPath();
            for (let i = 0; i < numPoints; i++) {
                const p = points[i];
                const x = (i / (numPoints - 1)) * w;
                const normMag = Math.sqrt(p.mag / maxPointMag);
                const y = h - 15 - normMag * (h * 0.7);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1.75;
            ctx.lineJoin = 'round';
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
    }, [analysis]);

    return (
        <div className="spectrum-chart-wrapper" style={{ width: '100%', height: '100px', position: 'relative' }}>
            <canvas 
                ref={canvasRef} 
                style={{ width: '100%', height: '100px', display: 'block', borderRadius: '8px' }} 
            />
        </div>
    );
};

export default memo(SpectrumChart);
