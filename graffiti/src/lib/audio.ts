import manifest from './audio-manifest.json';

interface AudioFile {
  src: string;
  voice?: string;
  duration_seconds?: number;
  bytes?: number;
  paragraphs?: number;
}

const files = (manifest as { files?: Record<string, AudioFile> }).files || {};

export function getPlaceAudio(id: string): AudioFile | null {
  return files[id] || null;
}
