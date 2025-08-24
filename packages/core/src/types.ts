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

// Enhanced Error Classes for MediaX SDK
export class MediaXError extends Error {
  public code: string;
  public jobType?: JobType;

  constructor(message: string, code: string = 'MEDIAX_ERROR', jobType?: JobType) {
    super(message);
    this.name = 'MediaXError';
    this.code = code;
    this.jobType = jobType;
  }
}

export class MediaXValidationError extends MediaXError {
  constructor(message: string, jobType?: JobType) {
    super(message, 'VALIDATION_ERROR', jobType);
    this.name = 'MediaXValidationError';
  }
}

// Additional specialized error class for FFmpeg-specific errors
export class MediaXFFmpegError extends MediaXError {
  public exitCode?: number;
  public stderr?: string;

  constructor(message: string, exitCode?: number, stderr?: string, jobType?: JobType) {
    super(message, 'FFMPEG_ERROR', jobType);
    this.name = 'MediaXFFmpegError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// Error code constants for better type safety and consistency
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_PARAMS: 'INVALID_PARAMS',
  
  // Pipeline errors
  PIPELINE_RUNNING: 'PIPELINE_RUNNING',
  PIPELINE_ABORTED: 'PIPELINE_ABORTED',
  PIPELINE_ERROR: 'PIPELINE_ERROR',
  
  // Job errors
  JOB_TIMEOUT: 'JOB_TIMEOUT',
  JOB_FAILED: 'JOB_FAILED',
  
  // FFmpeg errors
  FFMPEG_ERROR: 'FFMPEG_ERROR',
  FFMPEG_MISSING: 'FFMPEG_MISSING',
  NO_STREAMS: 'NO_STREAMS',
  INVALID_MEDIA: 'INVALID_MEDIA',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  CODEC_NOT_SUPPORTED: 'CODEC_NOT_SUPPORTED',
  
  // Generic
  MEDIAX_ERROR: 'MEDIAX_ERROR',
  UNKNOWN: 'UNKNOWN'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
