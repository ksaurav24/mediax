import ffmpeg from "fluent-ffmpeg";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { path as ffprobePath } from "@ffprobe-installer/ffprobe";

/**
 * Configure ffmpeg + ffprobe binaries
 * Ensures consistent execution across environments
 */
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/**
 * Create a new ffmpeg command instance
 */
export function createFfmpeg(input?: string) {
  return input ? ffmpeg(input) : ffmpeg();
}

/**
 * Probe file metadata
 */
export function probe(input: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
}
