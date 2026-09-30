import { pipeline, env } from '@huggingface/transformers';

// Ensure browser environment configuration
env.allowLocalModels = false;

class WhisperPipelineSingleton {
  static task = 'automatic-speech-recognition' as const;
  static model = 'onnx-community/whisper-tiny';
  static instance: any = null;

  static async getInstance(progress_callback?: (data: any) => void) {
    if (!this.instance) {
      this.instance = await pipeline(this.task, this.model, {
        progress_callback,
        dtype: 'fp32'
      });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, audio, language } = e.data;

  if (type === 'LOAD_MODEL') {
    try {
      await WhisperPipelineSingleton.getInstance((progress) => {
        self.postMessage({ type: 'PROGRESS', data: progress });
      });
      self.postMessage({ type: 'READY' });
    } catch (err: any) {
      self.postMessage({
        type: 'ERROR',
        error: err?.message || 'Failed to initialize Whisper model.'
      });
    }
  } else if (type === 'TRANSCRIBE') {
    try {
      const transcriber = await WhisperPipelineSingleton.getInstance((progress) => {
        self.postMessage({ type: 'PROGRESS', data: progress });
      });

      const langCode = 'english';

      const output = await transcriber(audio, {
        language: langCode,
        task: 'transcribe'
      });

      const text = Array.isArray(output)
        ? output.map((o) => o.text).join(' ')
        : (output as any)?.text || '';

      self.postMessage({ type: 'TRANSCRIPT', text: text.trim() });
    } catch (err: any) {
      self.postMessage({
        type: 'ERROR',
        error: err?.message || 'Whisper transcription failed.'
      });
    }
  }
});
