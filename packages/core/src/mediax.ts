import { Job } from "./job";
import { JobOptions } from "./types";

export class MediaX {
  constructor(private ffmpegPath: string = "ffmpeg") {}

  private createJob(opts: JobOptions): Job {
    return new Job(opts, this.ffmpegPath);
  }

  convert(input: string, output: string, format?: string): Job {
    return this.createJob({ type: "convert", input, output, format });
  }
  compress(input: string, output: string, bitrate = "1000k"): Job {
    return this.createJob({ type: "compress", input, output, bitrate });
  }
  thumbnail(input: string, output: string, time = "00:00:01"): Job {
    return this.createJob({ type: "thumbnail", input, output, time });
  }
  metadata(input: string): Job {
    return this.createJob({ type: "metadata", input });
  }
  extractAudio(input: string, output: string, codec = "mp3"): Job {
    return this.createJob({ type: "extractAudio", input, output, codec });
  }
  replaceAudio(video: string, audio: string, output: string): Job {
    return this.createJob({ type: "replaceAudio", input: video, output, audio });
  }
  toGif(input: string, output: string, opts: { start?: number; duration?: number } = {}): Job {
    return this.createJob({ type: "toGif", input, output, ...opts });
  }
  clip(input: string, output: string, opts: { start: number; duration: number }): Job {
    return this.createJob({ type: "clip", input, output, ...opts });
  }
  concat(inputs: string[], output: string): Job {
    return this.createJob({ type: "concat", input: inputs.join(","), output });
  }
  addWatermark(input: string, watermark: string, output: string, pos: { x: number; y: number } = { x: 10, y: 10 }): Job {
    return this.createJob({ type: "watermark", input, output, watermark, ...pos });
  }
  extractFrames(input: string, pattern: string, opts: { fps?: number } = {}): Job {
    return this.createJob({ type: "frames", input, output: pattern, ...opts });
  }
}
