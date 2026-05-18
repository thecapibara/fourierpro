import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Scissors, Check, X } from 'lucide-react';

const VoiceRecorder = ({ onConfirmDirect, onConfirmCrop, onCancel, audioCtx }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBuffer, setRecordedBuffer] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playProgress, setPlayProgress] = useState(0);
    const [recordingTime, setRecordingTime] = useState(0);

    const canvasRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const analyserNodeRef = useRef(null);
    const animationFrameRef = useRef(null);
    
    // Preview playback refs
    const playbackSourceRef = useRef(null);
    const playbackStartTimeRef = useRef(0);
    const playbackProgressFrameRef = useRef(null);
    const timerIntervalRef = useRef(null);

    // Recording state Ref to prevent stale closure bugs in requestAnimationFrame
    const isRecordingRef = useRef(false);

    // Stop recording and cleanup mic stream
    const cleanupStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    }, []);

    // Stop preview playback
    const stopPlayback = useCallback(() => {
        if (playbackSourceRef.current) {
            playbackSourceRef.current.stop();
            playbackSourceRef.current = null;
        }
        if (playbackProgressFrameRef.current) {
            cancelAnimationFrame(playbackProgressFrameRef.current);
            playbackProgressFrameRef.current = null;
        }
        setIsPlaying(false);
        setPlayProgress(0);
    }, []);

    // Cleanup everything on unmount
    useEffect(() => {
        return () => {
            cleanupStream();
            stopPlayback();
        };
    }, [cleanupStream, stopPlayback]);

    // Live wave drawing loop during recording
    const drawLiveWave = useCallback(() => {
        if (!canvasRef.current || !analyserNodeRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const w = rect.width;
        const h = rect.height;
        const amp = h / 2;
        
        const analyser = analyserNodeRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!isRecordingRef.current) return;
            animationFrameRef.current = requestAnimationFrame(draw);
            
            analyser.getByteTimeDomainData(dataArray);
            
            ctx.clearRect(0, 0, w, h);
            
            // Draw premium grid lines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, amp);
            ctx.lineTo(w, amp);
            ctx.stroke();
            
            // Draw real-time voice wave
            ctx.beginPath();
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#00d2ff';
            
            const sliceWidth = w / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * amp;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            ctx.lineTo(w, amp);
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset shadow
        };
        
        draw();
    }, []);

    // Draw static waveform once recorded
    const drawStaticWave = useCallback((buffer) => {
        if (!canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const w = rect.width;
        const h = rect.height;
        const amp = h / 2;
        
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / w);
        
        ctx.clearRect(0, 0, w, h);
        
        // Draw selection highlight (full length by default)
        ctx.fillStyle = 'rgba(0, 210, 255, 0.05)';
        ctx.fillRect(0, 0, w, h);
        
        // Draw static waveform
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < w; i++) {
            const val = data[i * step] || 0;
            const y = amp + val * amp;
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        ctx.stroke();

        // Highlight layer
        ctx.beginPath();
        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#00d2ff';
        for (let i = 0; i < w; i++) {
            const val = data[i * step] || 0;
            const y = amp + val * amp;
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }, []);

    // Draw playback progress bar
    useEffect(() => {
        if (!recordedBuffer || isRecording || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        // Redraw base static wave
        drawStaticWave(recordedBuffer);
        
        if (isPlaying && playProgress > 0) {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;
            const x = w * playProgress;
            
            ctx.beginPath();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffffff';
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }, [playProgress, isPlaying, recordedBuffer, isRecording, drawStaticWave]);

    // Stop recording voice (declared before startRecording so it can be safely referenced)
    const stopRecording = useCallback(() => {
        if (!isRecordingRef.current) return;
        
        cleanupStream();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        
        isRecordingRef.current = false;
        setIsRecording(false);
    }, [cleanupStream]);

    // Request permissions and start recording voice
    const startRecording = async () => {
        stopPlayback();
        setRecordedBuffer(null);
        setRecordingTime(0);
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            // Set up Web Audio Analyser for live visualization
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            
            sourceNodeRef.current = source;
            analyserNodeRef.current = analyser;
            
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            
            const chunks = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            
            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                // Decode to AudioBuffer
                const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                setRecordedBuffer(decodedBuffer);
                drawStaticWave(decodedBuffer);
            };
            
            mediaRecorder.start();
            
            // Set ref first to prevent race condition in visualizer rendering loop
            isRecordingRef.current = true;
            setIsRecording(true);
            
            // Set up visual drawing
            drawLiveWave();
            
            // Recording timer with a strict 10-second limit
            const maxDuration = 10;
            timerIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => {
                    if (prev >= maxDuration - 1) {
                        stopRecording();
                        return maxDuration;
                    }
                    return prev + 1;
                });
            }, 1000);
            
        } catch (err) {
            console.error('Could not acquire microphone access:', err);
            alert('Could not start recording. Please grant microphone access permissions.');
        }
    };

    // Preview play/pause recorded sound
    const playPreview = () => {
        if (!recordedBuffer) return;
        
        if (isPlaying) {
            stopPlayback();
            return;
        }
        
        const source = audioCtx.createBufferSource();
        source.buffer = recordedBuffer;
        source.connect(audioCtx.destination);
        
        const startTime = audioCtx.currentTime;
        source.start(0);
        playbackSourceRef.current = source;
        setIsPlaying(true);
        playbackStartTimeRef.current = startTime;
        
        const duration = recordedBuffer.duration;
        
        const updateProgress = () => {
            const elapsed = audioCtx.currentTime - startTime;
            const progress = elapsed / duration;
            if (progress >= 1) {
                stopPlayback();
            } else {
                setPlayProgress(progress);
                playbackProgressFrameRef.current = requestAnimationFrame(updateProgress);
            }
        };
        playbackProgressFrameRef.current = requestAnimationFrame(updateProgress);
        
        source.onended = () => {
            setIsPlaying(false);
            setPlayProgress(0);
        };
    };

    // Format recording timer seconds -> mm:ss
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="cropper-overlay">
            <div className="cropper-modal recorder-modal animate-scale-up">
                <div className="cropper-header">
                    <div className="title">
                        <Mic size={22} className="text-blue animate-pulse" />
                        <h2>Record Voice Sample</h2>
                    </div>
                    <button className="btn-close" onClick={onCancel}><X size={20} /></button>
                </div>

                <div className="cropper-body">
                    <p className="instruction">
                        {isRecording 
                            ? 'Recording in progress... Speak into your microphone.' 
                            : recordedBuffer 
                            ? 'Recording captured! Choose to analyze the full clip, crop it, or record new.' 
                            : 'Click the record button to begin capturing audio (Max 10 seconds).'}
                    </p>
                    
                    <div className="cropper-container recorder-container">
                        <canvas ref={canvasRef} className="cropper-canvas recorder-canvas" />
                        
                        {/* Interactive Neon 10s Time Progress Bar */}
                        {isRecording && (
                            <div className="recording-progress-bar-container">
                                <div 
                                    className="recording-progress-bar-fill animate-glowing-cyan" 
                                    style={{ width: `${(recordingTime / 10) * 100}%` }}
                                ></div>
                            </div>
                        )}

                        <div className="recorder-status-row">
                            {isRecording ? (
                                <div className="recording-indicator">
                                    <span className="red-dot blinking"></span>
                                    <span className="timer-val">{formatTime(recordingTime)} / 00:10</span>
                                </div>
                            ) : recordedBuffer ? (
                                <span className="duration-tag">{recordedBuffer.duration.toFixed(2)}s Captured</span>
                            ) : (
                                <span className="text-secondary">Mic ready</span>
                            )}
                        </div>
                    </div>
                    
                    {/* Minimalist, DAW-style Round Record Buttons */}
                    {!recordedBuffer && (
                        <div className="big-record-control">
                            {isRecording ? (
                                <div className="rec-btn-wrapper">
                                    <button className="btn-stop-rec glowing-red" onClick={stopRecording}>
                                        <Square size={24} fill="currentColor" />
                                    </button>
                                    <span className="rec-btn-label">Stop Recording</span>
                                </div>
                            ) : (
                                <div className="rec-btn-wrapper">
                                    <button className="btn-start-rec glowing-blue" onClick={startRecording}>
                                        <Mic size={28} />
                                    </button>
                                    <span className="rec-btn-label">Start Recording</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="cropper-footer">
                    {recordedBuffer ? (
                        <>
                            <button className="btn btn-secondary btn-preview-rec" onClick={playPreview}>
                                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                                <span>{isPlaying ? 'Pause' : 'Listen Preview'}</span>
                            </button>
                            
                            <div className="footer-right">
                                <button className="btn btn-danger-outline" onClick={startRecording}>
                                    <Trash2 size={18} />
                                    <span>Re-record</span>
                                </button>
                                <button className="btn btn-secondary-outline" onClick={() => onConfirmCrop(recordedBuffer)}>
                                    <Scissors size={18} />
                                    <span>Crop Segment</span>
                                </button>
                                <button className="btn btn-primary btn-success-filled" onClick={() => onConfirmDirect(recordedBuffer)}>
                                    <Check size={18} />
                                    <span>Analyze Full</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="footer-right" style={{ marginLeft: 'auto' }}>
                            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VoiceRecorder;
