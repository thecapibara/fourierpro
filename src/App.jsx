import { useState, useRef, useCallback } from 'react';
import { Upload, Play, Pause, Download, Activity, Layers, History, CheckCircle2, Zap, Mic, Sliders, Filter } from 'lucide-react';
import Waveform from './components/Waveform';
import AudioCropper from './components/AudioCropper';
import SpectrumChart from './components/SpectrumChart';
import VoiceRecorder from './components/VoiceRecorder';
import { getFullAnalysis, reconstructWithN } from './utils/fft';
import { playBuffer, playTone, getSupportedMimeType, getExtensionForMime } from './utils/audio';
import './App.css';
const STEPS = [50, 250, 1000, 5000, 20000, 131072, 999999];

const FOURIER_FACTS = [
    "Joseph Fourier developed this mathematics in 1807 to model how heat flows through solid metal!",
    "The Cooley-Tukey FFT (1965) is one of the top 10 algorithms of the 20th century, enabling JPEG, MP3, and mobile communications!",
    "Any continuous periodic sound—no matter how complex—can be perfectly reconstructed by summing up simple pure sine waves!",
    "Without the Fast Fourier Transform (FFT), decoding a 10-second audio track would take minutes instead of milliseconds!",
    "An in-place Cooley-Tukey Radix-2 FFT algorithm ensures lightning-fast spectral analysis and buttery-smooth browser performance."
];

function App() {
    const [analysis, setAnalysis] = useState(null);
    const [reconstructions, setReconstructions] = useState({});
    const [currentN, setCurrentN] = useState(0);
    const [activeSource, setActiveSource] = useState(null); // 'original', 'result', or null
    const [status, setStatus] = useState('Upload audio');
    const [playbackProgress, setPlaybackProgress] = useState(0);
    const [pendingBuffer, setPendingBuffer] = useState(null);
    const [showCropper, setShowCropper] = useState(false);
    const [showRecorder, setShowRecorder] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [factIndex, setFactIndex] = useState(0);
    const [noiseThreshold, setNoiseThreshold] = useState(0);
    const [tempThreshold, setTempThreshold] = useState(0);
    const [eq, setEq] = useState({ bass: 1, mids: 1, treble: 1 });
    const [tempEq, setTempEq] = useState({ bass: 1, mids: 1, treble: 1 });
    const [filters, setFilters] = useState({ lowpass: 20000, highpass: 0 });
    const [tempFilters, setTempFilters] = useState({ lowpass: 20000, highpass: 0 });
    
    const [audioCtx, setAudioCtx] = useState(null);
    const currentSourceRef = useRef(null);
    const progressIntervalRef = useRef(null);

    const initAudio = () => {
        let ctx = audioCtx;
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            setAudioCtx(ctx);
        }
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        return ctx;
    };

    const stopPlayback = useCallback(() => {
        if (currentSourceRef.current) {
            currentSourceRef.current.stop();
            currentSourceRef.current = null;
        }
        if (progressIntervalRef.current) cancelAnimationFrame(progressIntervalRef.current);
        setActiveSource(null);
        setPlaybackProgress(0);
    }, []);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ctx = initAudio();
        setStatus('Decoding...');
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        
        setPendingBuffer(buffer);
        setShowCropper(true);
        setStatus('Select fragment');
    };

    const processAudioBuffer = (buffer) => {
        setNoiseThreshold(0);
        setTempThreshold(0);
        setEq({ bass: 1, mids: 1, treble: 1 });
        setTempEq({ bass: 1, mids: 1, treble: 1 });
        setFilters({ lowpass: 20000, highpass: 0 });
        setTempFilters({ lowpass: 20000, highpass: 0 });
        setIsProcessing(true);
        setProcessingProgress(0);
        setFactIndex(Math.floor(Math.random() * FOURIER_FACTS.length));
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            setProcessingProgress(progress);
            
            if (progress === 50) {
                // Run the heavy calculations at 50% progress, when the loader is fully visible
                setTimeout(() => {
                    const results = getFullAnalysis(buffer);
                    setAnalysis(results);
                    
                    // Lazy-load optimization: Only calculate the active ALL MAX milestone initially
                    const data = reconstructWithN(results, 999999);
                    setReconstructions({
                        [999999]: data.slice(0, results.originalLen)
                    });
                    setCurrentN(999999); 
                }, 10);
            }
            
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    setIsProcessing(false);
                    setStatus('Ready');
                }, 200);
            }
        }, 80); // 80ms * 20 steps = 1.6s total progress duration
    };

    const getRawThreshold = useCallback((val) => {
        if (!analysis || !analysis.sorted || analysis.sorted.length === 0) return 0;
        const maxPeak = analysis.sorted[0].mag;
        return val * maxPeak; // 0% to 100% of the peak magnitude
    }, [analysis]);

    const handleThresholdDrag = (val) => {
        setTempThreshold(val);
        if (!analysis) return;
        
        const rawThreshold = getRawThreshold(val);

        // Recompute only the active currentN reconstruction for instant waveform feedback
        const data = reconstructWithN(analysis, currentN, rawThreshold, eq, filters);
        setReconstructions(prev => ({
            ...prev,
            [currentN]: data.slice(0, analysis.originalLen)
        }));
    };

    const handleThresholdRelease = () => {
        setNoiseThreshold(tempThreshold);
        if (!analysis) return;

        const rawThreshold = getRawThreshold(tempThreshold);

        // Highly Optimized: Recompute ONLY the active milestone on release to avoid freezing!
        const data = reconstructWithN(analysis, currentN, rawThreshold, eq, filters);
        const sliced = data.slice(0, analysis.originalLen);
        
        // Clear all other milestones so they will be lazily recomputed on demand
        setReconstructions({
            [currentN]: sliced
        });

        if (activeSource === 'result') {
            stopPlayback();
        }
    };

    const handleEqDrag = (band, val) => {
        const nextTempEq = { ...tempEq, [band]: val };
        setTempEq(nextTempEq);
        if (!analysis) return;

        const rawThreshold = getRawThreshold(noiseThreshold);

        // Recompute only currentN for real-time visual feedback
        const data = reconstructWithN(analysis, currentN, rawThreshold, nextTempEq, filters);
        setReconstructions(prev => ({
            ...prev,
            [currentN]: data.slice(0, analysis.originalLen)
        }));
    };

    const handleEqRelease = () => {
        setEq(tempEq);
        if (!analysis) return;

        const rawThreshold = getRawThreshold(noiseThreshold);
        const data = reconstructWithN(analysis, currentN, rawThreshold, tempEq, filters);
        const sliced = data.slice(0, analysis.originalLen);

        // Only compute active, clear others for lazy evaluation
        setReconstructions({
            [currentN]: sliced
        });

        if (activeSource === 'result') {
            stopPlayback();
        }
    };

    const handleFilterDrag = (type, val) => {
        const nextTempFilters = { ...tempFilters, [type]: val };
        setTempFilters(nextTempFilters);
        if (!analysis) return;

        const rawThreshold = getRawThreshold(noiseThreshold);

        // Recompute only currentN for real-time visual feedback
        const data = reconstructWithN(analysis, currentN, rawThreshold, eq, nextTempFilters);
        setReconstructions(prev => ({
            ...prev,
            [currentN]: data.slice(0, analysis.originalLen)
        }));
    };

    const handleFilterRelease = () => {
        setFilters(tempFilters);
        if (!analysis) return;

        const rawThreshold = getRawThreshold(noiseThreshold);
        const data = reconstructWithN(analysis, currentN, rawThreshold, eq, tempFilters);
        const sliced = data.slice(0, analysis.originalLen);

        // Only compute active, clear others for lazy evaluation
        setReconstructions({
            [currentN]: sliced
        });

        if (activeSource === 'result') {
            stopPlayback();
        }
    };

    const applyFilterPreset = (presetName) => {
        if (!analysis) return;
        let nextEq = { bass: 1, mids: 1, treble: 1 };
        let nextFilters = { lowpass: 20000, highpass: 0 };

        if (presetName === 'old-radio') {
            nextEq = { bass: 0.2, mids: 1.5, treble: 0.4 };
            nextFilters = { lowpass: 4000, highpass: 400 };
        } else if (presetName === 'sub-bass') {
            nextEq = { bass: 2.5, mids: 0.1, treble: 0.0 };
            nextFilters = { lowpass: 200, highpass: 0 };
        } else if (presetName === 'bright') {
            nextEq = { bass: 0.6, mids: 1.2, treble: 2.2 };
            nextFilters = { lowpass: 16000, highpass: 150 };
        }

        setEq(nextEq);
        setTempEq(nextEq);
        setFilters(nextFilters);
        setTempFilters(nextFilters);

        const rawThreshold = getRawThreshold(noiseThreshold);
        const data = reconstructWithN(analysis, currentN, rawThreshold, nextEq, nextFilters);
        const sliced = data.slice(0, analysis.originalLen);

        setReconstructions({
            [currentN]: sliced
        });

        if (activeSource === 'result') {
            stopPlayback();
        }
    };

    const handleSelectStep = (s) => {
        stopPlayback();
        setCurrentN(s);
        
        if (analysis && !reconstructions[s]) {
            const rawThreshold = getRawThreshold(noiseThreshold);
            const data = reconstructWithN(analysis, s, rawThreshold, eq, filters);
            const sliced = data.slice(0, analysis.originalLen);
            setReconstructions(prev => ({
                ...prev,
                [s]: sliced
            }));
        }
    };

    const handleConfirmCrop = (croppedBuffer) => {
        setShowCropper(false);
        setPendingBuffer(null);
        processAudioBuffer(croppedBuffer);
    };

    const startProgressTracker = useCallback((duration) => {
        const startTime = Date.now();
        setPlaybackProgress(0);
        
        if (progressIntervalRef.current) cancelAnimationFrame(progressIntervalRef.current);
        
        const update = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = elapsed / duration;
            if (progress >= 1) {
                stopPlayback();
            } else {
                setPlaybackProgress(progress);
                progressIntervalRef.current = requestAnimationFrame(update);
            }
        };
        progressIntervalRef.current = requestAnimationFrame(update);
    }, [stopPlayback]);

    const playAudio = (type, data) => {
        if (!data || !analysis) return;
        const ctx = initAudio();
        
        if (activeSource === type) {
            stopPlayback();
            return;
        }

        stopPlayback();
        setActiveSource(type);
        
        playBuffer(ctx, data, analysis.sampleRate).then(src => {
            currentSourceRef.current = src;
            const duration = data.length / analysis.sampleRate;
            startProgressTracker(duration);
            src.onended = () => {
                if (activeSource === type) stopPlayback();
            };
        });
    };

    const handleExport = async () => {
        const data = reconstructions[currentN];
        if (!data || !analysis) return;

        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const buffer = ctx.createBuffer(1, data.length, analysis.sampleRate);
        buffer.copyToChannel(data, 0);
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        
        const mimeType = getSupportedMimeType();
        const ext = getExtensionForMime(mimeType);
        const recorder = new MediaRecorder(dest.stream, { mimeType });
        const chunks = [];
        
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fourier_recon_${currentN}.${ext}`;
            a.click();
            setStatus('Export complete');
        };
        
        recorder.start();
        source.start();
        source.onended = () => recorder.stop();
        setStatus(`Exporting ${ext.toUpperCase()}...`);
    };

    const playSolo = (comp) => {
        const ctx = initAudio();
        playTone(ctx, comp.freq, comp.mag, comp.phase);
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="logo">
                    <div className="icon-box"><Zap size={24} fill="currentColor" /></div>
                    <div>
                        <h1>Fourier<span className="logo-pro">Pro</span><span className="logo-author">by JustGL</span></h1>
                        <p>Spectral Synthesis Platform</p>
                    </div>
                </div>
                
                <div className="header-actions">
                    <div className="status-badge">
                        <CheckCircle2 size={14} className={analysis ? 'text-green' : ''} />
                        {status}
                    </div>
                    <button className="btn btn-upload btn-record-mic" onClick={() => { initAudio(); setShowRecorder(true); }}>
                        <Mic size={18} />
                        <span>Record Mic</span>
                    </button>
                    <label className="btn btn-upload">
                        <Upload size={18} />
                        <span>Load Audio</span>
                        <input type="file" accept="audio/*" hidden onChange={handleUpload} />
                    </label>
                </div>
            </header>

            <main className="app-content">
                <div className="visual-section">
                    <div className="card minimal-card">
                        <div className="card-header">
                            <div className="title">
                                <History size={16} />
                                <span>Input Reference</span>
                            </div>
                            <button className="btn btn-control" onClick={() => playAudio('original', analysis?.originalData)} disabled={!analysis}>
                                {activeSource === 'original' ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                                <span>Listen Original</span>
                            </button>
                        </div>
                        <Waveform 
                            data={analysis?.originalData} 
                            color="#00d2ff" 
                            height={80} 
                            progress={activeSource === 'original' ? playbackProgress : 0} 
                        />
                    </div>

                    <div className="card main-visual">
                        <div className="card-header">
                            <div className="title">
                                <Layers size={16} />
                                <span>Reconstruction Result</span>
                                 {currentN > 0 && <span className="n-badge">{(currentN === 999999 && analysis) ? (analysis.nSize / 2).toLocaleString() : currentN.toLocaleString()} FREQS</span>}
                            </div>
                            <div className="actions-group">
                                <button className="btn btn-play-main" onClick={() => playAudio('result', reconstructions[currentN])} disabled={!reconstructions[currentN]}>
                                    {activeSource === 'result' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                    <span>{activeSource === 'result' ? 'Pause' : 'Play Result'}</span>
                                </button>
                                <button className="btn btn-export" onClick={handleExport} disabled={!reconstructions[currentN]}>
                                    <Download size={18} />
                                    <span>Download</span>
                                </button>
                            </div>
                        </div>
                        <Waveform 
                            data={reconstructions[currentN]} 
                            color="#ff7e5f" 
                            height={220} 
                            progress={activeSource === 'result' ? playbackProgress : 0} 
                        />
                        
                        <div className="step-picker-pro">
                            <div className="step-grid-pro">
                                {STEPS.filter(s => !analysis || s < analysis.nSize / 2 || s === 999999).map(s => (
                                    <button 
                                        key={s} 
                                        className={`step-btn-pro ${currentN === s ? 'active' : ''}`}
                                        onClick={() => handleSelectStep(s)}
                                        disabled={!analysis}
                                    >
                                        <div className="step-val">
                                            {s === 999999 
                                                ? (analysis ? (analysis.nSize / 2).toLocaleString() : 'ALL') 
                                                : s.toLocaleString()}
                                        </div>
                                        <div className="step-label">COMP</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Fourier Interactive DSP Controls */}
                    <div className="fourier-controls-grid">
                        {/* 3-Band Equalizer Card */}
                        <div className="card control-panel-card">
                            <div className="card-header mini-header">
                                <div className="title">
                                    <Sliders size={16} className="text-blue" />
                                    <span>3-Band Spectral Equalizer</span>
                                </div>
                            </div>
                            <div className="panel-body">
                                <p className="mini-desc">Adjust frequency band gains. Real-time multipliers applied to coefficients inside the FFT reconstruction loop!</p>
                                
                                <div className="eq-sliders-row">
                                    <div className="eq-slider-col">
                                        <span className="eq-band-label">Bass</span>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="300" 
                                            value={Math.round(tempEq.bass * 100)} 
                                            className="vertical-slider"
                                            onChange={(e) => handleEqDrag('bass', parseFloat(e.target.value) / 100)}
                                            onMouseUp={handleEqRelease}
                                            onTouchEnd={handleEqRelease}
                                            disabled={!analysis}
                                        />
                                        <span className="eq-val-text">{(tempEq.bass).toFixed(1)}x</span>
                                        <span className="eq-freq-range">0-250Hz</span>
                                    </div>
                                    
                                    <div className="eq-slider-col">
                                        <span className="eq-band-label">Mids</span>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="300" 
                                            value={Math.round(tempEq.mids * 100)} 
                                            className="vertical-slider"
                                            onChange={(e) => handleEqDrag('mids', parseFloat(e.target.value) / 100)}
                                            onMouseUp={handleEqRelease}
                                            onTouchEnd={handleEqRelease}
                                            disabled={!analysis}
                                        />
                                        <span className="eq-val-text">{(tempEq.mids).toFixed(1)}x</span>
                                        <span className="eq-freq-range">250-4k</span>
                                    </div>
                                    
                                    <div className="eq-slider-col">
                                        <span className="eq-band-label">Treble</span>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="300" 
                                            value={Math.round(tempEq.treble * 100)} 
                                            className="vertical-slider"
                                            onChange={(e) => handleEqDrag('treble', parseFloat(e.target.value) / 100)}
                                            onMouseUp={handleEqRelease}
                                            onTouchEnd={handleEqRelease}
                                            disabled={!analysis}
                                        />
                                        <span className="eq-val-text">{(tempEq.treble).toFixed(1)}x</span>
                                        <span className="eq-freq-range">4k-20k</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Precision Frequency Filters Card */}
                        <div className="card control-panel-card">
                            <div className="card-header mini-header">
                                <div className="title">
                                    <Filter size={16} className="text-orange" />
                                    <span>Precision Spectral Filters</span>
                                </div>
                            </div>
                            <div className="panel-body filters-panel">
                                <p className="mini-desc">Apply sharp brick-wall frequency domain cuts. Drag sliders or click quick presets below!</p>
                                
                                <div className="filter-slider-wrapper">
                                    <div className="slider-labels">
                                        <span>Lowpass Cutoff (HF)</span>
                                        <span className="slider-val-tag">
                                            {tempFilters.lowpass >= 1000 ? (tempFilters.lowpass / 1000).toFixed(1) + ' kHz' : tempFilters.lowpass + ' Hz'}
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="500" 
                                        max="20000" 
                                        step="100"
                                        value={tempFilters.lowpass} 
                                        className="gate-slider filter-slider"
                                        onChange={(e) => handleFilterDrag('lowpass', parseInt(e.target.value))}
                                        onMouseUp={handleFilterRelease}
                                        onTouchEnd={handleFilterRelease}
                                        disabled={!analysis}
                                    />
                                </div>

                                <div className="filter-slider-wrapper">
                                    <div className="slider-labels">
                                        <span>Highpass Cutoff (LF)</span>
                                        <span className="slider-val-tag">
                                            {tempFilters.highpass >= 1000 ? (tempFilters.highpass / 1000).toFixed(1) + ' kHz' : tempFilters.highpass + ' Hz'}
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="2000" 
                                        step="20"
                                        value={tempFilters.highpass} 
                                        className="gate-slider filter-slider"
                                        onChange={(e) => handleFilterDrag('highpass', parseInt(e.target.value))}
                                        onMouseUp={handleFilterRelease}
                                        onTouchEnd={handleFilterRelease}
                                        disabled={!analysis}
                                    />
                                </div>

                                <div className="preset-buttons-group">
                                    <button 
                                        className="btn btn-preset" 
                                        onClick={() => applyFilterPreset('old-radio')}
                                        disabled={!analysis}
                                    >
                                        Old Radio
                                    </button>
                                    <button 
                                        className="btn btn-preset" 
                                        onClick={() => applyFilterPreset('sub-bass')}
                                        disabled={!analysis}
                                    >
                                        Sub-Bass Only
                                    </button>
                                    <button 
                                        className="btn btn-preset" 
                                        onClick={() => applyFilterPreset('bright')}
                                        disabled={!analysis}
                                    >
                                        Bright Speech
                                    </button>
                                    <button 
                                        className="btn btn-preset btn-preset-reset" 
                                        onClick={() => applyFilterPreset('reset')}
                                        disabled={!analysis}
                                    >
                                        Reset All
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="list-section">
                    <div className="card side-card">
                        <div className="card-header">
                            <div className="title">
                                <Activity size={16} />
                                <span>Spectral Spectrum</span>
                            </div>
                        </div>
                        <div className="spectrum-view">
                            <SpectrumChart analysis={analysis} onPlayTone={playSolo} />
                            <div className="spectrum-info">
                                <p>Smooth continuous parametric EQ spectrum curve (frequency distribution).</p>
                            </div>
                        </div>
                        
                        <div className="top-freqs-mini">
                            <div className="mini-title">Dominant Peaks (Pure Tone Player)</div>
                            <div className="mini-desc">Click a row to listen to its isolated sine wave. This reveals the individual frequencies that build up the original audio clip!</div>
                            {analysis ? (
                                analysis.peaks.slice(0, 6).map((c, i) => {
                                    const percent = (c.mag / analysis.peaks[0].mag) * 100;
                                    return (
                                        <div 
                                            key={i} 
                                            className="mini-freq-row interactive"
                                            onClick={() => playSolo(c)}
                                            title="Click to play pure harmonic tone"
                                        >
                                            <div className="play-icon-box">
                                                <Play size={10} fill="currentColor" />
                                            </div>
                                            <span className="freq-val">{c.freq >= 1000 ? (c.freq / 1000).toFixed(1) + ' kHz' : Math.round(c.freq) + ' Hz'}</span>
                                            <div className="mini-bar-bg">
                                                <div className="mini-bar" style={{ width: `${percent}%` }}></div>
                                            </div>
                                            <span className="percent-val">{Math.round(percent)}%</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="empty-state-mini">No harmonics extracted</div>
                            )}
                        </div>

                        <div className="card-divider"></div>
                        
                        <div className="noise-gate-section-mini">
                            <div className="mini-title-flex">
                                <Zap size={14} className="text-blue" />
                                <span>Spectral De-noise Gate</span>
                            </div>
                            <p className="mini-desc">Filter out low-amplitude noise bins. Drag to clean up voice recordings or songs in real time!</p>
                            
                            <div className="slider-wrapper">
                                <div className="slider-labels">
                                    <span>Threshold</span>
                                    <span className="slider-val-tag">{Math.round(tempThreshold * 100)}%</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    value={Math.round(tempThreshold * 100)} 
                                    className="gate-slider"
                                    onChange={(e) => handleThresholdDrag(parseFloat(e.target.value) / 100)}
                                    onMouseUp={handleThresholdRelease}
                                    onTouchEnd={handleThresholdRelease}
                                    disabled={!analysis}
                                />
                                <div className="slider-ticks">
                                    <span>Off (0%)</span>
                                    <span>Max Gate (100% peak)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {showCropper && pendingBuffer && (
                <AudioCropper 
                    buffer={pendingBuffer} 
                    audioCtx={audioCtx}
                    onConfirm={handleConfirmCrop}
                    onCancel={() => { setShowCropper(false); setPendingBuffer(null); setStatus('Upload cancelled'); }}
                />
            )}

            {showRecorder && (
                <VoiceRecorder 
                    audioCtx={audioCtx}
                    onConfirmDirect={(recordedBuffer) => {
                        setShowRecorder(false);
                        processAudioBuffer(recordedBuffer);
                    }}
                    onConfirmCrop={(recordedBuffer) => {
                        setShowRecorder(false);
                        setPendingBuffer(recordedBuffer);
                        setShowCropper(true);
                        setStatus('Select fragment');
                    }}
                    onCancel={() => {
                        setShowRecorder(false);
                        setStatus('Ready');
                    }}
                />
            )}

            {isProcessing && (
                <div className="processing-overlay">
                    <div className="processing-modal animate-scale-up">
                        <div className="processing-hologram">
                            <div className="hologram-ring"></div>
                            <div className="hologram-ring inner"></div>
                            <Activity size={28} className="processing-icon" />
                        </div>
                        
                        <h2 className="processing-title">Spectral Analysis</h2>
                        <p className="processing-status">Running optimized Radix-2 Cooley-Tukey FFT...</p>
                        
                        <div className="processing-bar-container">
                            <div className="processing-bar-track">
                                <div className="processing-bar-fill" style={{ width: `${processingProgress}%` }}></div>
                            </div>
                            <span className="processing-percentage">{processingProgress}%</span>
                        </div>

                        <div className="fact-box">
                            <div className="fact-label">🔬 Scientific Trivia</div>
                            <p className="fact-text">"{FOURIER_FACTS[factIndex]}"</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
