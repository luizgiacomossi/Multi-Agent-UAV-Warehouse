/**
 * Audio Recording and Resampling Utilities for Local Whisper Speech-to-Text
 */

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  public async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }

    this.recordedChunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick supported audio format
    const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', ''];
    let chosenMime = '';
    for (const mime of mimeTypes) {
      if (!mime || MediaRecorder.isTypeSupported(mime)) {
        chosenMime = mime;
        break;
      }
    }

    this.mediaRecorder = chosenMime
      ? new MediaRecorder(this.stream, { mimeType: chosenMime })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(250); // Emit chunk every 250ms
  }

  public async stop(): Promise<Float32Array> {
    return new Promise<Float32Array>((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('MediaRecorder was not initialized.'));
      }

      this.mediaRecorder.onstop = async () => {
        try {
          // Stop all stream tracks to turn off microphone LED
          this.stream?.getTracks().forEach((track) => track.stop());

          if (this.recordedChunks.length === 0) {
            return resolve(new Float32Array(0));
          }

          const blob = new Blob(this.recordedChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm'
          });

          const arrayBuffer = await blob.arrayBuffer();
          const AudioContextClass =
            window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();

          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const pcm16k = this.resampleTo16k(audioBuffer);
          await audioCtx.close();

          resolve(pcm16k);
        } catch (err) {
          reject(err);
        }
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  public abort(): void {
    try {
      this.stream?.getTracks().forEach((track) => track.stop());
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch (_) {}
    this.recordedChunks = [];
  }

  /**
   * Resamples an AudioBuffer to single-channel 16,000 Hz Float32Array expected by Whisper.
   */
  private resampleTo16k(audioBuffer: AudioBuffer): Float32Array {
    const sourceRate = audioBuffer.sampleRate;
    const targetRate = 16000;
    const channelData = audioBuffer.getChannelData(0); // Mono channel 0

    if (sourceRate === targetRate) {
      return channelData;
    }

    const ratio = sourceRate / targetRate;
    const targetLength = Math.round(channelData.length / ratio);
    const resampled = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const sourceIndex = i * ratio;
      const indexFloor = Math.floor(sourceIndex);
      const indexCeil = Math.min(channelData.length - 1, indexFloor + 1);
      const fraction = sourceIndex - indexFloor;
      resampled[i] = (1 - fraction) * channelData[indexFloor] + fraction * channelData[indexCeil];
    }

    return resampled;
  }
}
