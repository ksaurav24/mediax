export type JobId = string;

export type JobType =
  | "convert" | "compress" | "thumbnail" | "metadata"
  | "extractAudio" | "replaceAudio" | "toGif" | "clip"
  | "concat" | "watermark" | "frames";

export interface JobOptions {
  id?: JobId;
  type: JobType;
  input: string;
  output?: string;
  format?: string;
  bitrate?: string;
  time?: string;
  codec?: string;
  audio?: string;
  start?: number;
  duration?: number;
  watermark?: string;
  x?: number;
  y?: number;
  fps?: number;
}

export type JobState = "queued" | "running" | "done" | "error" | "cancelled";

export interface ProgressInfo {
  percent: number;      // 0–100 (approx)
  frames: number;
  currentFps: number;
  currentKbps: number;
  time?: string;        // HH:MM:SS.xx
}

export type JobEventMap = {
  start: (cmd: string) => void;
  progress: (progress: ProgressInfo) => void;
  error: (err: Error) => void;
  done: (output?: string) => void;
  state: (state: JobState) => void; // lifecycle
};
