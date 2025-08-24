import TypedEmitter from "typed-emitter";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import { JobOptions, ProgressInfo } from "./types";

// Event typings
export type JobEventMap = {
  start: (cmdLine: string) => void;
  progress: (progress: ProgressInfo) => void;
  done: (output?: string) => void;
  error: (err: Error) => void;
  metadata: (metadata: any) => void;
};

// Helper: parse HH:MM:SS.mmm -> seconds
function parseTimeToSeconds(time: string): number {
  const [h, m, s] = time.split(":").map(Number);
  if ([h, m, s].some(isNaN)) return 0;
  return h * 3600 + m * 60 + s;
}

// Job class
export class Job extends (require("events")
  .EventEmitter as new () => TypedEmitter<JobEventMap>) {
  public opts: JobOptions;
  private durationSeconds: number = 0;

  constructor(opts: JobOptions) {
    super();
    this.opts = opts;

    // Ensure ffmpeg binaries are set
    try {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      ffmpeg.setFfprobePath(ffprobeInstaller.path);
    } catch (err) {
      process.nextTick(() => this.emit("error", new Error("FFmpeg binaries not found or invalid")));
    }

    // Validate input path
    if (!this.opts.input) {
      process.nextTick(() => this.emit("error", new Error("Input path is required")));
    }
  }

  getDuration(): number {
    return this.durationSeconds;
  }

  private fetchDuration(): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(this.opts.input, (err, metadata) => {
        if (err) return reject(new Error(`Failed to fetch media metadata: ${err.message}`));
        if (!metadata?.format?.duration) {
          return reject(new Error("Unable to determine media duration"));
        }
        this.durationSeconds = metadata.format.duration;
        resolve();
      });
    });
  }

  public async start(): Promise<void> {
    try {
      if (!this.opts.input) throw new Error("Job input not specified");
      if (this.opts.type !== "metadata") {
        await this.fetchDuration();
      }

      let command = ffmpeg(this.opts.input);

      // Validate output for types that require it
      const typesRequiringOutput = [
        "convert", "compress", "thumbnail", "extractAudio",
        "replaceAudio", "toGif", "clip", "concat", "watermark", "frames"
      ];
      if (typesRequiringOutput.includes(this.opts.type) && !this.opts.output) {
        throw new Error(`Output path is required for job type "${this.opts.type}"`);
      }

      switch (this.opts.type) {
        case "convert":
          if (this.opts.format) command.output(this.opts.output!).format(this.opts.format);
          else command.output(this.opts.output!);
          break;
        case "compress":
          command.output(this.opts.output!).videoBitrate(this.opts.bitrate || "1000k");
          break;
        case "thumbnail":
          command
            .seekInput(this.opts.time || "00:00:01")
            .outputOptions(["-vframes", "1", "-map", "0:v:0", "-q:v", "2", "-y"])
            .output(this.opts.output!);
          break;
        case "metadata":
          ffmpeg.ffprobe(this.opts.input, (err, metadata) => {
            if (err) this.emit("error", new Error(`Failed to fetch metadata: ${err.message}`));
            else this.emit("metadata", metadata);
          });
          return;
        case "extractAudio":
          command.noVideo().output(this.opts.output!).audioCodec(this.opts.codec || "aac");
          break;
        case "replaceAudio":
          if (!this.opts.audio) throw new Error("Audio path is required for replaceAudio");
          command.input(this.opts.audio!).output(this.opts.output!)
            .outputOptions(["-c:v copy", "-map 0:v:0", "-map 1:a:0"]);
          break;
        case "toGif":
          if (this.opts.start) command.setStartTime(this.opts.start);
          if (this.opts.duration) command.setDuration(this.opts.duration);
          command.output(this.opts.output!);
          break;
        case "clip":
          command.setStartTime(this.opts.start!).setDuration(this.opts.duration!).output(this.opts.output!);
          break;
        case "concat":
          command.input(`concat:${this.opts.input}`).output(this.opts.output!);
          break;
        case "watermark":
          command.complexFilter([{ filter: "overlay", options: { x: this.opts.x || 10, y: this.opts.y || 10 } }])
            .output(this.opts.output!);
          break;
        case "frames":
          if (this.opts.fps) command.fps(this.opts.fps);
          command.output(this.opts.output!);
          break;
        default:
          throw new Error(`Unknown job type: ${this.opts.type}`);
      }

      let lastPercent = 0;

      (command as any)
        .on("start", (cmdLine: string) => this.emit("start", cmdLine))
        .on("progress", (progress: ProgressInfo & { timemark?: string }) => {
          try {
            if (!this.durationSeconds || !progress.timemark) return;
            const currentPercent = Math.min(parseTimeToSeconds(progress.timemark) / this.durationSeconds * 100, 100);
            if (currentPercent - lastPercent >= 1) {
              lastPercent = currentPercent;
              this.emit("progress", { ...progress, percent: Number(currentPercent.toFixed(2)) });
            }
          } catch (err) {
            this.emit("error", new Error(`Progress calculation failed: ${(err as Error).message}`));
          }
        })
        .on("end", () => this.emit("done", this.opts.output))
        .on("error", (err: Error) => this.emit("error", new Error(`FFmpeg error: ${err.message}`)))
        .run();
    } catch (err) {
      this.emit("error", err as Error);
    }
  }
}
