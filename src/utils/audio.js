export async function playBuffer(audioCtx, data, sampleRate) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const buffer = audioCtx.createBuffer(1, data.length, sampleRate);
    buffer.copyToChannel(data, 0);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    return source;
}

export async function playTone(audioCtx, freq, mag, phase, duration = 1.0) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    // Normalize volume: components can have very small magnitudes
    // We boost them so they are audible, but cap to 0.3
    const volume = Math.min(Math.max(mag * 20, 0.05), 0.3); 
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

export function getSupportedMimeType() {
    const types = [
        'audio/mp4',        // AAC (M4A) - Safari/Chrome on Mac
        'audio/mpeg',       // MP3
        'audio/ogg;codecs=opus', // OGG - Firefox/Chrome
        'audio/webm;codecs=opus' // WebM - Chrome
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/wav';
}

export function getExtensionForMime(mime) {
    if (mime.includes('mp4')) return 'm4a';
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('webm')) return 'webm';
    return 'wav';
}
