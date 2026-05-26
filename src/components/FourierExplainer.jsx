import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, X, ChevronLeft, ChevronRight as ChevronRightIcon, Activity, Volume2, Sparkles } from 'lucide-react';
import { reconstructWithN } from '../utils/fft';

// ==========================================
// STEP 1: Zoomable Time-Domain Waveform Canvas
// ==========================================
const Step1Waveform = ({ analysis }) => {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(300); // number of samples to show

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // Draw center zero line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();

            const data = analysis.originalData;
            const middleIdx = Math.floor(data.length / 2);
            const halfZoom = Math.floor(zoom / 2);
            const startIdx = Math.max(0, middleIdx - halfZoom);
            const endIdx = Math.min(data.length, middleIdx + halfZoom);
            const displayLen = endIdx - startIdx;

            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0, 210, 255, 0.5)';
            ctx.beginPath();

            for (let i = 0; i < w; i++) {
                const dataRatio = i / w;
                const dataIdx = startIdx + Math.floor(dataRatio * displayLen);
                const val = data[dataIdx] || 0;
                const x = i;
                const y = (h / 2) - (val * (h / 2) * 0.85);

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset glow
        };

        draw();
        const resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(canvas);
        return () => resizeObserver.disconnect();
    }, [analysis, zoom]);

    return (
        <div className="explainer-visual-container">
            <div className="canvas-header">
                <span>ZOOMED WAVEFORM (MIDDLE OF RECORDING)</span>
                <span className="info-tag">{zoom} Samples shown</span>
            </div>
            <canvas ref={canvasRef} className="explainer-canvas" style={{ height: '220px' }} />
            <div className="slider-control-box">
                <div className="slider-label-row">
                    <span>Wave Zoom Level (Resolution)</span>
                    <span className="slider-val">{zoom} samples</span>
                </div>
                <input 
                    type="range" 
                    min="50" 
                    max="1500" 
                    step="10"
                    value={zoom} 
                    onChange={(e) => setZoom(parseInt(e.target.value))}
                    className="gate-slider"
                />
                <div className="slider-ticks">
                    <span>High Detail (50 samples)</span>
                    <span>Full Wave (1500 samples)</span>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// STEP 2: Dominant Frequencies Oscilloscopes
// ==========================================
const MiniOscilloscope = ({ peak, index, analysis, audioCtx, toneNodesRef }) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let t = 0;

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.scale(dpr, dpr);

            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            ctx.clearRect(0, 0, w, h);

            // Draw baseline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.beginPath();
            ctx.moveTo(0, h/2);
            ctx.lineTo(w, h/2);
            ctx.stroke();

            // Wave properties
            // Normalize magnitude for visual appearance
            const maxPeakMag = analysis.peaks[0].mag || 1;
            const normMag = (peak.mag / maxPeakMag) * 0.7 + 0.15; // range 0.15 to 0.85
            const amplitude = (h / 2) * normMag;
            
            // Frequency speed multiplier (map frequency to drawing speed)
            const cycles = Math.min(10, Math.max(2, peak.freq / 150)); 
            const speed = 0.05 + (peak.freq / 10000); 

            ctx.strokeStyle = index % 2 === 0 ? '#00d2ff' : '#ff7e5f';
            ctx.lineWidth = 1.5;
            ctx.beginPath();

            for (let x = 0; x < w; x++) {
                const angle = (x / w) * Math.PI * 2 * cycles - t;
                const y = (h / 2) + Math.sin(angle + peak.phase) * amplitude;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            t += speed;
            animationRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationRef.current);
    }, [peak, index, analysis]);

    const triggerPlayTone = () => {
        // Synthesize tone manually so we can stop it if needed
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = peak.freq;
        
        // Volume envelope
        const vol = Math.min(Math.max(peak.mag * 25, 0.05), 0.25);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);

        toneNodesRef.current.push(osc);
    };

    return (
        <div className="mini-freq-row interactive" onClick={triggerPlayTone} style={{ margin: '8px 0', padding: '10px' }}>
            <div className="play-icon-box" style={{ background: index % 2 === 0 ? 'rgba(0, 210, 255, 0.1)' : 'rgba(255, 126, 95, 0.1)' }}>
                <Volume2 size={12} style={{ color: index % 2 === 0 ? '#00d2ff' : '#ff7e5f' }} />
            </div>
            <div style={{ width: '85px', textAlign: 'left' }}>
                <div className="freq-val" style={{ fontSize: '0.8rem', margin: 0 }}>
                    {peak.freq >= 1000 ? (peak.freq / 1000).toFixed(1) + ' kHz' : Math.round(peak.freq) + ' Hz'}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>
                    AMP: {(peak.mag * 100).toFixed(2)}%
                </div>
            </div>
            <div style={{ flex: 1, height: '40px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', overflow: 'hidden' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
        </div>
    );
};

const Step2Harmonics = ({ analysis, audioCtx, toneNodesRef }) => {
    const peaks = useMemo(() => analysis.peaks.slice(0, 5), [analysis]);

    return (
        <div className="explainer-visual-container">
            <div className="canvas-header">
                <span>TOP 5 DETECTED HARMONICS</span>
                <span className="info-tag" style={{ color: '#00ff88' }}>Click any row to listen</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {peaks.map((p, i) => (
                    <MiniOscilloscope 
                        key={i} 
                        peak={p} 
                        index={i} 
                        analysis={analysis}
                        audioCtx={audioCtx} 
                        toneNodesRef={toneNodesRef} 
                    />
                ))}
            </div>
        </div>
    );
};

// ==========================================
// STEP 3: Synthesis Waveform Overlay
// ==========================================
const Step3Synthesis = ({ analysis, audioCtx, activeSourceRef, progressIntervalRef, stopParentAudio }) => {
    const canvasRef = useRef(null);
    const [nFreqs, setNFreqs] = useState(5);
    const [isPlayingRecon, setIsPlayingRecon] = useState(false);
    const [, setReconProgress] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    
    const animIntervalId = useRef(null);

    // Pre-sliced original window
    const zoomLength = 400;
    const middleIdx = Math.floor(analysis.originalLen / 2);
    const startIdx = Math.max(0, middleIdx - zoomLength / 2);
    
    const originalSlice = useMemo(() => {
        return analysis.originalData.slice(startIdx, startIdx + zoomLength);
    }, [analysis, startIdx]);

    // Compute reconstruction for active N
    const reconstructedSlice = useMemo(() => {
        const fullRecon = reconstructWithN(analysis, nFreqs);
        return fullRecon.slice(startIdx, startIdx + zoomLength);
    }, [analysis, nFreqs, startIdx]);

    // Stop reconstruction audio
    const stopReconAudio = () => {
        if (activeSourceRef.current) {
            try {
                activeSourceRef.current.stop();
            } catch {
                // Ignore error on stop
            }
            activeSourceRef.current = null;
        }
        if (progressIntervalRef.current) {
            cancelAnimationFrame(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        setIsPlayingRecon(false);
        setReconProgress(0);
    };

    // Synthesize and play reconstruction audio
    const playReconstructedAudio = async () => {
        if (isPlayingRecon) {
            stopReconAudio();
            return;
        }
        stopParentAudio();
        stopReconAudio();

        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const fullRecon = reconstructWithN(analysis, nFreqs);
        const source = audioCtx.createBufferSource();
        const buffer = audioCtx.createBuffer(1, fullRecon.length, analysis.sampleRate);
        buffer.copyToChannel(fullRecon, 0);
        source.buffer = buffer;
        source.connect(audioCtx.destination);

        const startTime = audioCtx.currentTime;
        const duration = fullRecon.length / analysis.sampleRate;
        source.start(0);
        activeSourceRef.current = source;
        setIsPlayingRecon(true);

        const updateProgress = () => {
            const elapsed = audioCtx.currentTime - startTime;
            const prog = elapsed / duration;
            if (prog >= 1) {
                setIsPlayingRecon(false);
                setReconProgress(0);
            } else {
                setReconProgress(prog);
                progressIntervalRef.current = requestAnimationFrame(updateProgress);
            }
        };
        progressIntervalRef.current = requestAnimationFrame(updateProgress);

        source.onended = () => {
            setIsPlayingRecon(false);
            setReconProgress(0);
        };
    };

    // Animate auto-build sequence
    const startAutoBuild = () => {
        if (isAnimating) {
            if (animIntervalId.current) clearInterval(animIntervalId.current);
            setIsAnimating(false);
            return;
        }

        stopReconAudio();
        setIsAnimating(true);
        setNFreqs(1);

        const steps = [1, 2, 3, 5, 10, 25, 50, 100, 250, 1000, 999999];
        let currentIdx = 0;

        animIntervalId.current = setInterval(() => {
            currentIdx++;
            if (currentIdx >= steps.length) {
                if (animIntervalId.current) clearInterval(animIntervalId.current);
                setIsAnimating(false);
            } else {
                setNFreqs(steps[currentIdx]);
            }
        }, 600);
    };

    // Clean up animation interval & audio on unmount
    useEffect(() => {
        const activeSrc = activeSourceRef;
        const progInt = progressIntervalRef;
        return () => {
            if (animIntervalId.current) clearInterval(animIntervalId.current);
            
            // Clean up running audio sources
            if (activeSrc.current) {
                try {
                    activeSrc.current.stop();
                } catch {
                    // Ignore error on stop
                }
                activeSrc.current = null;
            }
            if (progInt.current) {
                cancelAnimationFrame(progInt.current);
                progInt.current = null;
            }
        };
    }, [activeSourceRef, progressIntervalRef]);

    // Draw Canvas
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.scale(dpr, dpr);

            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            ctx.clearRect(0, 0, w, h);

            // Zero line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(0, h/2);
            ctx.lineTo(w, h/2);
            ctx.stroke();

            // Draw Original Wave in background (light cyan dashed line)
            ctx.strokeStyle = 'rgba(0, 210, 255, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            for (let i = 0; i < w; i++) {
                const ratio = i / w;
                const idx = Math.floor(ratio * originalSlice.length);
                const val = originalSlice[idx] || 0;
                const x = i;
                const y = (h/2) - (val * (h/2) * 0.8);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.setLineDash([]); // Reset dash

            // Draw Reconstructed Wave in foreground (glowing orange)
            ctx.strokeStyle = '#ff7e5f';
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255, 126, 95, 0.6)';
            ctx.beginPath();
            for (let i = 0; i < w; i++) {
                const ratio = i / w;
                const idx = Math.floor(ratio * reconstructedSlice.length);
                const val = reconstructedSlice[idx] || 0;
                const x = i;
                const y = (h/2) - (val * (h/2) * 0.8);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        };

        draw();
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [originalSlice, reconstructedSlice]);

    return (
        <div className="explainer-visual-container">
            <div className="canvas-header">
                <span>WAVE RECONSTRUCTION COMPARISON</span>
                <span className="n-badge" style={{ margin: 0 }}>
                    {nFreqs === 999999 ? 'ALL' : nFreqs} FREQS
                </span>
            </div>
            <canvas ref={canvasRef} className="explainer-canvas" style={{ height: '170px' }} />
            
            <div className="synthesis-controls" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
                {/* Slider */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '5px' }}>
                        <span>Frequencies Included (N)</span>
                        <span style={{ fontWeight: 'bold', color: '#ff7e5f' }}>
                            {nFreqs === 999999 ? `All (${analysis.coefficients.length})` : nFreqs}
                        </span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        value={nFreqs === 999999 ? 100 : Math.min(100, nFreqs)} 
                        onChange={(e) => {
                            stopReconAudio();
                            const val = parseInt(e.target.value);
                            if (val === 100) setNFreqs(999999);
                            else setNFreqs(val);
                        }}
                        className="gate-slider"
                        disabled={isAnimating}
                    />
                    <div className="slider-ticks" style={{ fontSize: '0.65rem' }}>
                        <span>1 (Simplest Hum)</span>
                        <span>50</span>
                        <span>All (Perfect Match)</span>
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        className={`btn btn-secondary ${isPlayingRecon ? 'active-recon' : ''}`} 
                        onClick={playReconstructedAudio} 
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', justifyContent: 'center' }}
                    >
                        {isPlayingRecon ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        <span>{isPlayingRecon ? 'Pause Sound' : 'Listen Reconstruction'}</span>
                    </button>

                    <button 
                        className={`btn btn-secondary ${isAnimating ? 'btn-animate-active' : ''}`}
                        onClick={startAutoBuild} 
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', justifyContent: 'center' }}
                    >
                        <Sparkles size={14} className={isAnimating ? 'spin-icon' : ''} />
                        <span>{isAnimating ? 'Stop Animation' : 'Animate 1 ➔ All'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// STEP 4: Geometric Epicycles Canvas Drawing
// ==========================================
const Step4Epicycles = ({ analysis }) => {
    const canvasRef = useRef(null);
    const [nCircles, setNCircles] = useState(8);
    const [speed, setSpeed] = useState(1);
    const [isPaused, setIsPaused] = useState(false);
    const animationRef = useRef(null);

    // Precompute DFT on 128 samples from the middle
    const dftCoefficients = useMemo(() => {
        const N = 128;
        const middle = Math.floor(analysis.originalLen / 2);
        const rawSamples = analysis.originalData.slice(middle - N/2, middle + N/2);
        
        // Normalize samples slightly to look good as circle drawings
        const maxVal = Math.max(...rawSamples.map(Math.abs)) || 1;
        const samples = rawSamples.map(s => s / maxVal);

        const X = [];
        for (let k = 0; k < N; k++) {
            let re = 0;
            let im = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                re += samples[n] * Math.cos(angle);
                im -= samples[n] * Math.sin(angle);
            }
            re = re / N;
            im = im / N;
            const mag = Math.sqrt(re * re + im * im);
            const phase = Math.atan2(im, re);
            X.push({ freq: k, mag, phase, re, im });
        }
        // Sort by magnitude, drawing the DC component (k=0) and then the largest oscillations
        return X.sort((a, b) => b.mag - a.mag);
    }, [analysis]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        let time = 0;
        const waveHistory = [];
        const maxHistoryPoints = 280;

        const draw = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.scale(dpr, dpr);

            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            ctx.clearRect(0, 0, w, h);

            // Origin for circles
            const cx = 130;
            const cy = h / 2;

            let x = cx;
            let y = cy;

            // Draw orbiting circles head-to-tail
            const limit = Math.min(nCircles, dftCoefficients.length);
            ctx.lineWidth = 1;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            for (let i = 0; i < limit; i++) {
                const coef = dftCoefficients[i];
                
                // Scale factor for radius
                const scaleFactor = 65; 
                const prevX = x;
                const prevY = y;
                
                // Exclude DC component (freq = 0) from spinning (just centers it)
                const radius = coef.mag * scaleFactor;
                const angle = coef.freq * time + coef.phase;

                x += radius * Math.cos(angle);
                y += radius * Math.sin(angle);

                // Draw circles
                if (radius > 1) {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 - (i * 0.002)})`;
                    ctx.beginPath();
                    ctx.arc(prevX, prevY, radius, 0, Math.PI * 2);
                    ctx.stroke();

                    // Draw vector arm (radius line)
                    ctx.strokeStyle = i === 0 ? '#ff7e5f' : 'rgba(0, 210, 255, 0.4)';
                    ctx.beginPath();
                    ctx.moveTo(prevX, prevY);
                    ctx.lineTo(x, y);
                    ctx.stroke();

                    // Draw joints
                    ctx.fillStyle = i === 0 ? '#ff7e5f' : '#00d2ff';
                    ctx.beginPath();
                    ctx.arc(x, y, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Add tip coordinate to trace history
            if (!isPaused) {
                waveHistory.unshift(y);
                if (waveHistory.length > maxHistoryPoints) {
                    waveHistory.pop();
                }
            }

            // Draw horizontal connector line from tip to the scrolling graph start
            const graphStartIdx = 260;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(graphStartIdx, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw vertical gridline where graph starts
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.beginPath();
            ctx.moveTo(graphStartIdx, 0);
            ctx.lineTo(graphStartIdx, h);
            ctx.stroke();

            // Draw the scrolling traced waveform on the right
            if (waveHistory.length > 0) {
                ctx.strokeStyle = '#00d2ff';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 8;
                ctx.shadowColor = 'rgba(0, 210, 255, 0.4)';
                ctx.beginPath();
                for (let i = 0; i < waveHistory.length; i++) {
                    const gx = graphStartIdx + i;
                    const gy = waveHistory[i];
                    if (gx > w) break;
                    if (i === 0) ctx.moveTo(gx, gy);
                    else ctx.lineTo(gx, gy);
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Text labels on canvas
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '9px monospace';
            ctx.fillText("PHASORS (ROTATING CIRCLES)", 20, 20);
            ctx.fillText("SCROLLING TIME-DOMAIN WAVE", graphStartIdx + 10, 20);

            // Time increment: proportional to speed slider
            if (!isPaused) {
                time += 0.015 * speed;
            }

            animationRef.current = requestAnimationFrame(draw);
        };

        draw();
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        
        return () => {
            cancelAnimationFrame(animationRef.current);
            observer.disconnect();
        };
    }, [nCircles, speed, isPaused, dftCoefficients]);

    return (
        <div className="explainer-visual-container">
            <div className="canvas-header">
                <span>ROTATING ORBITS AND TRACE PATH</span>
                <button 
                    onClick={() => setIsPaused(prev => !prev)} 
                    className="btn btn-control" 
                    style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                >
                    {isPaused ? 'Resume' : 'Pause'}
                </button>
            </div>
            <canvas ref={canvasRef} className="explainer-canvas" style={{ height: '170px' }} />

            <div className="epicycle-controls-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
                {/* Circle count slider */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                        <span>Circle Count (Phasors)</span>
                        <span style={{ fontWeight: 'bold', color: '#00d2ff' }}>{nCircles}</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="32" 
                        value={nCircles} 
                        onChange={(e) => setNCircles(parseInt(e.target.value))}
                        className="gate-slider"
                    />
                </div>
                {/* Speed slider */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '3px' }}>
                        <span>Rotation Speed</span>
                        <span style={{ fontWeight: 'bold', color: '#ff7e5f' }}>{speed.toFixed(1)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="3" 
                        step="0.1"
                        value={speed} 
                        onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="gate-slider"
                    />
                </div>
            </div>
        </div>
    );
};

// ==========================================
// MAIN COMPONENT EXPORT
// ==========================================
const FourierExplainer = ({ analysis, audioCtx, onCancel }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
    const [, setOriginalProgress] = useState(0);

    // Audio source references to stop sounds on transitions
    const activeSourceRef = useRef(null);
    const progressIntervalRef = useRef(null);
    const toneNodesRef = useRef([]);

    // Stop any active playbacks
    const stopAllAudio = () => {
        if (activeSourceRef.current) {
            try {
                activeSourceRef.current.stop();
            } catch {
                // Ignore error on stop
            }
            activeSourceRef.current = null;
        }
        if (progressIntervalRef.current) {
            cancelAnimationFrame(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        setIsPlayingOriginal(false);
        setOriginalProgress(0);

        // Stop any running tone synthesizers
        toneNodesRef.current.forEach(node => {
            try {
                node.stop();
            } catch {
                // Ignore error on stop
            }
        });
        toneNodesRef.current = [];
    };

    // Clean up audio on unmount or step change
    useEffect(() => {
        return () => stopAllAudio();
    }, [currentStep]);

    // Handle original audio preview playback (Step 1)
    const playOriginal = async () => {
        if (isPlayingOriginal) {
            stopAllAudio();
            return;
        }
        stopAllAudio();

        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const source = audioCtx.createBufferSource();
        const buffer = audioCtx.createBuffer(1, analysis.originalData.length, analysis.sampleRate);
        buffer.copyToChannel(analysis.originalData, 0);
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        
        const startTime = audioCtx.currentTime;
        const duration = analysis.originalData.length / analysis.sampleRate;
        source.start(0);
        activeSourceRef.current = source;
        setIsPlayingOriginal(true);

        const updateProgress = () => {
            const elapsed = audioCtx.currentTime - startTime;
            const prog = elapsed / duration;
            if (prog >= 1) {
                setIsPlayingOriginal(false);
                setOriginalProgress(0);
            } else {
                setOriginalProgress(prog);
                progressIntervalRef.current = requestAnimationFrame(updateProgress);
            }
        };
        progressIntervalRef.current = requestAnimationFrame(updateProgress);

        source.onended = () => {
            setIsPlayingOriginal(false);
            setOriginalProgress(0);
        };
    };

    // ==========================================
    // TEXT CONTENTS FOR THE STEPS
    // ==========================================
    const STEP_TEXTS = useMemo(() => [
        {
            title: "1. The Time Domain (Часовий домен)",
            subtitle: "What is an audio wave?",
            text: (
                <>
                    <p>Every sound you hear is just rapid vibrations of air pressure. When we record audio, we measure these pressure levels thousands of times per second (e.g. 44,100 Hz sample rate) and save them as numbers.</p>
                    <p>Looking at the waveform graph, it appears as a single complex, chaotic line. How do we make sense of this jumble of data? This is where the magic of Joseph Fourier comes in.</p>
                    <p className="highlight-box">
                        <strong>💡 Try this:</strong> Drag the slider below the graph to zoom in. You'll see that what looks like a solid block of noise is actually built from smooth, continuous curves.
                    </p>
                </>
            )
        },
        {
            title: "2. The Spectral Prism (Частотний спектр)",
            subtitle: "Splitting sound into pure tones",
            text: (
                <>
                    <p>Just like a glass prism splits white light into a rainbow of colors, the <strong>Fourier Transform</strong> splits any complex sound wave into a spectrum of individual pure frequencies.</p>
                    <p>Each frequency is a perfect sine wave. An amazing mathematical truth is that <em>any periodic sound</em>, no matter how complex, is formed by adding up these simple pure tones.</p>
                    <p className="highlight-box">
                        <strong>🔊 Try this:</strong> Click on the frequency rows on the right. You will hear the isolated pure musical sine wave extracted directly from your audio.
                    </p>
                </>
            )
        },
        {
            title: "3. Signal Synthesis (Покроковий Синтез)",
            subtitle: "Adding frequencies one-by-one",
            text: (
                <>
                    <p>If we start with just one frequency (the strongest one) and plot it, we get a simple sine wave. Sound-wise, it's just a single boring hum.</p>
                    <p>But when we add the 2nd strongest frequency, then the 3rd, 5th, 10th... the combined waveform starts to warp, stretch, and match our original signal.</p>
                    <p className="highlight-box">
                        <strong>🚀 Try this:</strong> Click <strong>Animate 1 ➔ All</strong>. Watch the orange line morph to fit the blue dashed reference. Click <strong>Listen Reconstruction</strong> to hear how the sound updates from a simple hum into your actual audio clip as more details are loaded.
                    </p>
                </>
            )
        },
        {
            title: "4. Epicycles (Орбіти Фур'є)",
            subtitle: "Drawing with rotating circles",
            text: (
                <>
                    <p>Geometrically, a sine wave represents circular motion. Fourier showed that we can reconstruct any wave by stacking rotating circles (phasors) head-to-tail.</p>
                    <p>The first circle represents the strongest frequency. The second circle is attached to the tip of the first, rotating at its own speed and angle. As they spin, the tip of the final circle traces out the wave.</p>
                    <p className="highlight-box">
                        <strong>🔬 Try this:</strong> Adjust the <strong>Circle Count</strong> to see how adding circles makes the traced wave match the wave shape. Slow down the speed to watch the vector coordinates calculate in real time.
                    </p>
                </>
            )
        }
    ], []);

    const currentStepData = STEP_TEXTS[currentStep];

    const nextStep = () => {
        if (currentStep < STEP_TEXTS.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    return (
        <div className="explainer-overlay">
            <div className="explainer-modal animate-scale-up">
                {/* Header */}
                <div className="explainer-header">
                    <div className="title">
                        <Activity size={20} style={{ color: '#c084fc' }} />
                        <h2>Fourier Academy / Фур'є-Академія</h2>
                    </div>
                    <button className="btn-close" onClick={onCancel}><X size={20} /></button>
                </div>

                {/* Sub-navigation tabs */}
                <div className="explainer-tabs">
                    {STEP_TEXTS.map((step, idx) => (
                        <button 
                            key={idx}
                            className={`explainer-tab-btn ${currentStep === idx ? 'active' : ''}`}
                            onClick={() => setCurrentStep(idx)}
                        >
                            <span>Step {idx + 1}</span>
                        </button>
                    ))}
                </div>

                {/* Main Content Body */}
                <div className="explainer-body">
                    {/* Left: Text Explanations */}
                    <div className="explainer-text-panel">
                        <div className="step-tag">STEP {currentStep + 1} OF 4</div>
                        <h3 className="step-title">{currentStepData.title}</h3>
                        <h4 className="step-subtitle">{currentStepData.subtitle}</h4>
                        <div className="step-desc-content">
                            {currentStepData.text}
                        </div>

                        {currentStep === 0 && (
                            <button 
                                className={`btn btn-secondary ${isPlayingOriginal ? 'active-recon' : ''}`}
                                onClick={playOriginal} 
                                style={{ marginTop: '15px', width: 'fit-content' }}
                            >
                                {isPlayingOriginal ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                                <span>{isPlayingOriginal ? 'Stop Audio' : 'Listen Full Wave'}</span>
                            </button>
                        )}
                    </div>

                    {/* Right: Visual Canvas Display */}
                    <div className="explainer-visual-panel">
                        {currentStep === 0 && <Step1Waveform analysis={analysis} />}
                        {currentStep === 1 && <Step2Harmonics analysis={analysis} audioCtx={audioCtx} toneNodesRef={toneNodesRef} />}
                        {currentStep === 2 && <Step3Synthesis 
                            analysis={analysis} 
                            audioCtx={audioCtx} 
                            activeSourceRef={activeSourceRef}
                            progressIntervalRef={progressIntervalRef}
                            stopParentAudio={stopAllAudio}
                        />}
                        {currentStep === 3 && <Step4Epicycles analysis={analysis} />}
                    </div>
                </div>

                {/* Footer Navigation */}
                <div className="explainer-footer">
                    <button 
                        className="btn btn-secondary" 
                        onClick={prevStep}
                        disabled={currentStep === 0}
                    >
                        <ChevronLeft size={18} />
                        <span>Back</span>
                    </button>

                    <div className="step-indicators">
                        {STEP_TEXTS.map((_, idx) => (
                            <span 
                                key={idx} 
                                className={`dot ${currentStep === idx ? 'active' : ''}`}
                                onClick={() => setCurrentStep(idx)}
                            />
                        ))}
                    </div>

                    {currentStep < STEP_TEXTS.length - 1 ? (
                        <button className="btn btn-primary" onClick={nextStep}>
                            <span>Next Step</span>
                            <ChevronRightIcon size={18} />
                        </button>
                    ) : (
                        <button className="btn btn-primary btn-success-finish" onClick={onCancel}>
                            <span>Finish Tutorial</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FourierExplainer;
