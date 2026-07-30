// AudioWorkletProcessor for real-time audio capture, VAD, and visualization
// This replaces ScriptProcessorNode for better performance and lower latency

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Configuration
    this.sampleRate = sampleRate; // Typically 48000 or 44100
    this.targetRate = 16000; // Gemini Live API expects 16kHz
    this.downsampleRatio = this.sampleRate / this.targetRate; // e.g., 48000/16000 = 3
    
    // VAD settings
    this.vadThreshold = 0.008; // RMS threshold for speech detection
    this.vadHangoverFrames = 15; // Frames of silence before stopping
    this.vadSilenceFrames = 0;
    this.isSpeaking = false;
    
    // Buffer for downsampling
    this.inputBuffer = new Float32Array(0);
    this.bufferSize = 2048; // Process in chunks
    
    // Visualization data (sent to main thread)
    this.visualizationInterval = 0;
    this.visualizationIntervalFrames = Math.ceil(this.sampleRate / 60); // ~60fps
    
    // Message handling
    this.port.onmessage = (event) => {
      if (event.data.type === 'config') {
        if (event.data.vadThreshold !== undefined) {
          this.vadThreshold = event.data.vadThreshold;
        }
        if (event.data.vadHangoverFrames !== undefined) {
          this.vadHangoverFrames = event.data.vadHangoverFrames;
        }
      }
    };
  }

  // Compute RMS energy of audio frame
  computeRMS(input) {
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * input[i];
    }
    return Math.sqrt(sum / input.length);
  }

  // Downsample from source sample rate to target sample rate (e.g., 48kHz -> 16kHz)
  downsample(input) {
    const outputLength = Math.floor(input.length / this.downsampleRatio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * this.downsampleRatio;
      const srcIndexInt = Math.floor(srcIndex);
      const frac = srcIndex - srcIndexInt;
      
      // Linear interpolation for better quality
      if (srcIndexInt + 1 < input.length) {
        output[i] = input[srcIndexInt] * (1 - frac) + input[srcIndexInt + 1] * frac;
      } else {
        output[i] = input[srcIndexInt] || 0;
      }
    }
    
    return output;
  }

  // Convert Float32Array to Int16Array (for base64 encoding)
  floatToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and convert to 16-bit PCM
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = clamped * 0x7FFF;
    }
    return int16Array;
  }

  // Convert Int16Array to base64 string
  int16ToBase64(int16Array) {
    // Convert to Uint8Array for base64 encoding
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (input.length > 0) {
      const inputChannel = input[0]; // Mono input
      
      // Compute RMS for VAD
      const rms = this.computeRMS(inputChannel);
      const isSpeech = rms > this.vadThreshold;
      
      // VAD state machine
      if (isSpeech) {
        this.vadSilenceFrames = 0;
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.port.postMessage({ type: 'speech-start' });
        }
      } else {
        this.vadSilenceFrames++;
        if (this.isSpeaking && this.vadSilenceFrames > this.vadHangoverFrames) {
          this.isSpeaking = false;
          this.port.postMessage({ type: 'speech-end' });
        }
      }
      
      // Only process and send audio if speaking or in hangover period
      const shouldSendAudio = this.isSpeaking || this.vadSilenceFrames <= this.vadHangoverFrames;
      
      if (shouldSendAudio) {
        // Downsample for Gemini (48kHz/44.1kHz -> 16kHz)
        const downsampled = this.downsample(inputChannel);
        
        // Convert to Int16 and base64
        const int16 = this.floatToInt16(downsampled);
        const base64 = this.int16ToBase64(int16);
        
        // Send audio data to main thread
        this.port.postMessage({
          type: 'audio-data',
          data: base64,
          mimeType: 'audio/pcm;rate=16000',
          rms: rms,
          isSpeech: isSpeech
        });
      }
      
      // Send visualization data at ~60fps
      this.visualizationInterval++;
      if (this.visualizationInterval >= this.visualizationIntervalFrames) {
        this.visualizationInterval = 0;
        
        // Compute frequency bins for visualization (simple approach)
        // We'll send RMS and a few frequency bands
        const fftSize = 64;
        const freqData = new Float32Array(fftSize);
        
        // Simple frequency analysis using Goertzel-like approach for a few bands
        // For visualization, we'll just send the RMS and a few pseudo-bands
        const bands = 8;
        const bandData = new Float32Array(bands);
        const bandWidth = Math.floor(inputChannel.length / bands);
        
        for (let b = 0; b < bands; b++) {
          let sum = 0;
          const start = b * bandWidth;
          const end = Math.min(start + bandWidth, inputChannel.length);
          for (let i = start; i < end; i++) {
            sum += inputChannel[i] * inputChannel[i];
          }
          bandData[b] = Math.sqrt(sum / (end - start)) * 100; // Scale for visualization
        }
        
        this.port.postMessage({
          type: 'visualization',
          rms: rms * 100,
          bands: bandData,
          isSpeech: isSpeech
        });
      }
    }
    
    // Pass through audio (for monitoring if needed)
    if (outputs[0] && outputs[0].length > 0) {
      const output = outputs[0][0];
      if (input.length > 0 && input[0]) {
        output.set(input[0]);
      }
    }
    
    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);