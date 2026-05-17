// Optimized In-Place Cooley-Tukey Radix-2 FFT/IFFT
export function fft(re, im, invert = false) {
    const n = re.length;
    if (n <= 1) return;

    // Bit reversal permutation step
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;

        if (i < j) {
            let temp = re[i];
            re[i] = re[j];
            re[j] = temp;

            temp = im[i];
            im[i] = im[j];
            im[j] = temp;
        }
    }

    // Iterative butterfly merges
    for (let len = 2; len <= n; len <<= 1) {
        const angle = (invert ? 2 : -2) * Math.PI / len;
        const wlen_r = Math.cos(angle);
        const wlen_i = Math.sin(angle);
        
        for (let i = 0; i < n; i += len) {
            let w_r = 1.0;
            let w_i = 0.0;
            const half_len = len >> 1;
            for (let j = 0; j < half_len; j++) {
                const u_r = re[i + j];
                const u_i = im[i + j];
                
                const target_r = re[i + j + half_len];
                const target_i = im[i + j + half_len];
                const t_r = w_r * target_r - w_i * target_i;
                const t_i = w_r * target_i + w_i * target_r;
                
                re[i + j] = u_r + t_r;
                im[i + j] = u_i + t_i;
                re[i + j + half_len] = u_r - t_r;
                im[i + j + half_len] = u_i - t_i;
                
                const next_w_r = w_r * wlen_r - w_i * wlen_i;
                const next_w_i = w_r * wlen_i + w_i * wlen_r;
                w_r = next_w_r;
                w_i = next_w_i;
            }
        }
    }

    // Normalize for inverse FFT (IFFT)
    if (invert) {
        for (let i = 0; i < n; i++) {
            re[i] /= n;
            im[i] /= n;
        }
    }
}

export function getFullAnalysis(buffer) {
    const sampleRate = buffer.sampleRate;
    const maxSamples = sampleRate * 10;
    const originalData = buffer.getChannelData(0).slice(0, Math.min(buffer.length, maxSamples));
    
    const nSize = Math.pow(2, Math.ceil(Math.log2(originalData.length)));
    const re = new Float32Array(nSize);
    const im = new Float32Array(nSize);
    re.set(originalData);

    fft(re, im, false);

    const coefficients = [];
    for (let k = 0; k <= nSize / 2; k++) {
        const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (nSize / 2);
        const phase = Math.atan2(im[k], re[k]);
        const freq = (k * sampleRate) / nSize;
        coefficients.push({ mag, phase, freq, k, re: re[k], im: im[k] });
    }

    const sorted = [...coefficients].sort((a, b) => b.mag - a.mag);
    
    // Peak detection with minimum frequency separation to ensure diverse, non-clustered frequencies
    const sortedPeaks = [...coefficients].sort((a, b) => b.mag - a.mag);
    const peaks = [];
    
    for (let i = 0; i < sortedPeaks.length; i++) {
        const candidate = sortedPeaks[i];
        
        // Skip sub-bass noise below 45 Hz
        if (candidate.freq < 45) continue;
        
        // Skip insignificant magnitudes
        if (candidate.mag < 0.0001) continue;

        // Ensure frequency is separated from already picked peaks by at least 60Hz or 25% of frequency
        let tooClose = false;
        for (let j = 0; j < peaks.length; j++) {
            const selected = peaks[j];
            const minDistance = Math.max(60, selected.freq * 0.25);
            if (Math.abs(candidate.freq - selected.freq) < minDistance) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            peaks.push(candidate);
        }

        // Need top 10 diverse peaks max
        if (peaks.length >= 10) break;
    }
    
    return { 
        coefficients, 
        sorted, 
        peaks,
        nSize, 
        sampleRate,
        originalLen: originalData.length,
        originalData
    };
}

export function reconstructWithN(analysis, N) {
    const { sorted, nSize, coefficients } = analysis;
    const re = new Float32Array(nSize);
    const im = new Float32Array(nSize);
    
    // Create a fast lookup array instead of a heavy JS Set
    const topNIndices = new Uint8Array(nSize / 2 + 1);
    const sliced = sorted.slice(0, N);
    for (let i = 0; i < sliced.length; i++) {
        topNIndices[sliced[i].k] = 1;
    }

    for (let k = 0; k <= nSize / 2; k++) {
        if (topNIndices[k] === 1) {
            re[k] = coefficients[k].re;
            im[k] = coefficients[k].im;
            
            // Reconstruct negative frequencies for a real signal
            if (k > 0 && k < nSize / 2) {
                re[nSize - k] = re[k];
                im[nSize - k] = -im[k];
            } else {
                // DC (k=0) and Nyquist (k=n/2) must be purely real for real-valued signals
                im[k] = 0;
            }
        }
    }

    fft(re, im, true);
    return re;
}
