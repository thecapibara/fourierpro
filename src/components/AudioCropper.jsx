import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, X, Scissors, Check } from 'lucide-react';

const AudioCropper = ({ buffer, onConfirm, onCancel, audioCtx }) => {
    const [range, setRange] = useState({ start: 0, end: Math.min(10, buffer.duration) });
    const [isPlaying, setIsPlaying] = useState(false);
    const [previewProgress, setPreviewProgress] = useState(0);
    
    const canvasRef = useRef(null);
    const sourceRef = useRef(null);
    const startTimeRef = useRef(0);
    const requestRef = useRef(null);

    const duration = buffer.duration;
    const minLen = 2;
    const maxLen = 10;

    // Drawing Waveform
    // Drawing Waveform
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = rect.height;
            const data = buffer.getChannelData(0);
            const step = Math.floor(data.length / w) || 1;
            const amp = h / 2;

            ctx.clearRect(0, 0, w, h);
            
            // Draw background (dark container)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.fillRect(0, 0, w, h);

            // Precalculate envelope paths
            const topY = new Float32Array(w);
            const bottomY = new Float32Array(w);
            for (let i = 0; i < w; i++) {
                const start = i * step;
                const end = Math.min(start + step, data.length);
                let max = 0;
                let min = 0;
                for (let j = start; j < end; j++) {
                    const val = data[j];
                    if (val > max) max = val;
                    if (val < min) min = val;
                }
                // Clamp and scale slightly down to avoid vertical wall-touching
                max = Math.min(Math.max(max, -1), 1);
                min = Math.min(Math.max(min, -1), 1);
                topY[i] = amp - max * (amp * 0.85);
                bottomY[i] = amp - min * (amp * 0.85);
            }

            // Helper to draw the envelope path
            const drawEnvelopePath = () => {
                ctx.beginPath();
                for (let i = 0; i < w; i++) {
                    if (i === 0) ctx.moveTo(i, topY[i]);
                    else ctx.lineTo(i, topY[i]);
                }
                for (let i = w - 1; i >= 0; i--) {
                    ctx.lineTo(i, bottomY[i]);
                }
                ctx.closePath();
            };

            // 1. Draw Background (Unselected) Waveform
            drawEnvelopePath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 2. Draw Highlight Selected Region Waveform
            const startX = (range.start / duration) * w;
            const endX = (range.end / duration) * w;

            // Draw selected background highlight
            ctx.fillStyle = 'rgba(0, 210, 255, 0.03)';
            ctx.fillRect(startX, 0, endX - startX, h);

            // Draw active waveform clipped to the range
            ctx.save();
            ctx.beginPath();
            ctx.rect(startX, 0, endX - startX, h);
            ctx.clip();

            drawEnvelopePath();
            
            // Active fill gradient
            const activeGradient = ctx.createLinearGradient(0, 0, 0, h);
            activeGradient.addColorStop(0, '#00d2ff');
            activeGradient.addColorStop(0.5, '#00d2ff30');
            activeGradient.addColorStop(1, '#00d2ff');
            ctx.fillStyle = activeGradient;
            ctx.fill();

            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1.25;
            ctx.stroke();

            ctx.restore();

            // 3. Draw Handles
            const drawHandle = (x, color) => {
                ctx.fillStyle = color;
                ctx.fillRect(x - 2, 0, 4, h);
                ctx.beginPath();
                ctx.arc(x, 10, 6, 0, Math.PI * 2);
                ctx.arc(x, h - 10, 6, 0, Math.PI * 2);
                ctx.fill();
            };

            drawHandle(startX, '#00d2ff');
            drawHandle(endX, '#00d2ff');

            // 4. Draw Progress Line if playing
            if (isPlaying) {
                const progressX = (previewProgress / duration) * w;
                ctx.beginPath();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.moveTo(progressX, 0);
                ctx.lineTo(progressX, h);
                ctx.stroke();
            }
        };

        // Redraw immediately
        draw();

        // Listen for parent resize (robust modal open layout mapping)
        const resizeObserver = new ResizeObserver(() => {
            draw();
        });
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
        };

    }, [buffer, range, isPlaying, previewProgress, duration]);

    const stopPlayback = useCallback(() => {
        if (sourceRef.current) {
            sourceRef.current.stop();
            sourceRef.current = null;
        }
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        setIsPlaying(false);
        setPreviewProgress(0);
    }, []);

    const playPreview = async () => {
        if (isPlaying) {
            stopPlayback();
            return;
        }

        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        
        const startTime = audioCtx.currentTime;
        source.start(0, range.start, range.end - range.start);
        sourceRef.current = source;
        setIsPlaying(true);
        startTimeRef.current = startTime;

        const updateProgress = () => {
            const elapsed = audioCtx.currentTime - startTime;
            const currentPos = range.start + elapsed;
            if (currentPos >= range.end) {
                stopPlayback();
            } else {
                setPreviewProgress(currentPos);
                requestRef.current = requestAnimationFrame(updateProgress);
            }
        };
        requestRef.current = requestAnimationFrame(updateProgress);

        source.onended = () => {
            setIsPlaying(false);
            setPreviewProgress(0);
        };
    };

    const handleCanvasInteraction = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / rect.width) * duration;
        
        // Find closest handle
        const distStart = Math.abs(time - range.start);
        const distEnd = Math.abs(time - range.end);

        const handleMove = (moveEvent) => {
            const moveX = moveEvent.clientX - rect.left;
            const moveTime = Math.max(0, Math.min(duration, (moveX / rect.width) * duration));
            
            setRange(prev => {
                let newRange = { ...prev };
                if (distStart < distEnd) {
                    newRange.start = Math.min(moveTime, prev.end - minLen);
                    if (prev.end - newRange.start > maxLen) {
                        newRange.end = newRange.start + maxLen;
                    }
                } else {
                    newRange.end = Math.max(moveTime, prev.start + minLen);
                    if (newRange.end - prev.start > maxLen) {
                        newRange.start = newRange.end - maxLen;
                    }
                }
                return newRange;
            });
        };

        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const confirmCrop = () => {
        stopPlayback();
        const sampleRate = buffer.sampleRate;
        const startIdx = Math.floor(range.start * sampleRate);
        const endIdx = Math.floor(range.end * sampleRate);
        const length = endIdx - startIdx;
        
        const croppedBuffer = audioCtx.createBuffer(
            buffer.numberOfChannels,
            length,
            sampleRate
        );

        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const channelData = buffer.getChannelData(i);
            const croppedData = channelData.slice(startIdx, endIdx);
            croppedBuffer.copyToChannel(croppedData, i);
        }

        onConfirm(croppedBuffer);
    };

    return (
        <div className="cropper-overlay">
            <div className="cropper-modal">
                <div className="cropper-header">
                    <div className="title">
                        <Scissors size={20} className="text-blue" />
                        <h2>Select Audio Segment</h2>
                    </div>
                    <button className="btn-close" onClick={onCancel}><X size={20} /></button>
                </div>

                <div className="cropper-body">
                    <p className="instruction">Drag handles to select a 2-10 second fragment to analyze.</p>
                    
                    <div className="cropper-container">
                        <canvas 
                            ref={canvasRef} 
                            onMouseDown={handleCanvasInteraction}
                            className="cropper-canvas"
                        />
                        <div className="range-info">
                            <span>{range.start.toFixed(2)}s</span>
                            <span className="duration-tag">{(range.end - range.start).toFixed(2)}s Selected</span>
                            <span>{range.end.toFixed(2)}s</span>
                        </div>
                    </div>
                </div>

                <div className="cropper-footer">
                    <button className="btn btn-secondary" onClick={playPreview}>
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        <span>{isPlaying ? 'Stop' : 'Preview Selection'}</span>
                    </button>
                    
                    <div className="footer-right">
                        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                        <button className="btn btn-primary" onClick={confirmCrop}>
                            <Check size={18} />
                            <span>Confirm & Process</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AudioCropper;
