import { EventEmitter } from "events";
import { spawn, ChildProcessWithoutNullStreams, spawnSync } from "child_process";
import { JobOptions, ProgressInfo, JobState } from "./types";
import { newId } from "./utils/id";

function verify(binary: string) {
  const res = spawnSync(binary, ["-version"], { stdio: "ignore" });
  if (res.error) throw new Error(`ffmpeg not found at "${binary}"`);
}

function safeSpawn(binary: string, args: string[]): ChildProcessWithoutNullStreams {
  try {
    return spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error(`Failed to execute ${binary}: not found`);
    throw e;
  }
}

export class Job extends EventEmitter {
  readonly id: string;
  private opts: JobOptions;
  private ffmpegPath: string;
  private proc?: ChildProcessWithoutNullStreams;
  private state: JobState = "queued";
  private durationSec?: number; // if you parse input duration, you can set this for better %

  constructor(opts: JobOptions, ffmpegPath: string = "ffmpeg") {
    super();
    this.ffmpegPath = ffmpegPath;
    verify(this.ffmpegPath);
    this.id = opts.id ?? newId();
    this.opts = this.withDefaults(opts);
  }

  getState(): JobState { return this.state; }
  getOptions(): Readonly<JobOptions> { return this.opts; }

  private setState(s: JobState) {
    this.state = s;
    this.emit("state", s);
  }

  private withDefaults(o: JobOptions): JobOptions {
    return {
      ...o,
      output: o.output ?? "output.mp4",
      bitrate: o.bitrate ?? "1000k",
      time: o.time ?? "00:00:01",
      codec: o.codec ?? "aac",
      start: o.start ?? 0,
      duration: o.duration ?? 5,
      fps: o.fps ?? 1,
      x: o.x ?? 10,
      y: o.y ?? 10,
    };
  }

  start(timeoutMs?: number) {
    const args = this.buildArgs(this.opts);
    this.emit("start", `${this.ffmpegPath} ${args.join(" ")}`);
    this.setState("running");

    const proc = safeSpawn(this.ffmpegPath, args);
    this.proc = proc;

    if (timeoutMs) setTimeout(() => this.cancel("timeout"), timeoutMs).unref?.();

    proc.on("error", (err: any) => {
      if (err?.code === "ENOENT") return this.fail(new Error("ffmpeg missing"));
      this.fail(err);
    });

    proc.stderr.on("data", (buf: Buffer) => {
      const line = buf.toString();
      const info = this.parseProgress(line);
      if (info) this.emit("progress", info);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        this.setState("done");
        this.emit("done", this.opts.output);
      } else if (this.state !== "cancelled") {
        this.fail(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  }

  cancel(reason = "cancelled") {
    if (this.proc && this.state === "running") {
      this.proc.kill("SIGKILL");
      this.setState("cancelled");
      this.emit("error", new Error(`Job ${reason}`));
    }
  }

  private fail(err: Error) {
    this.setState("error");
    this.emit("error", err);
  }

  private buildArgs(o: JobOptions): string[] {
    switch (o.type) {
      case "convert":
        if (!o.output) throw new Error("convert: missing output");
        return ["-i", o.input, "-y", o.output];

      case "compress":
        if (!o.output) throw new Error("compress: missing output");
        return ["-i", o.input, "-b:v", o.bitrate!, "-y", o.output];

      case "thumbnail":
        if (!o.output) throw new Error("thumbnail: missing output");
        return ["-ss", o.time!, "-i", o.input, "-vframes", "1", "-y", o.output];

      case "metadata":
        return ["-i", o.input, "-f", "ffmetadata", "-"];

      case "extractAudio":
        if (!o.output) throw new Error("extractAudio: missing output");
        return ["-i", o.input, "-vn", "-acodec", o.codec!, "-y", o.output];

      case "replaceAudio":
        if (!o.audio || !o.output) throw new Error("replaceAudio: missing audio/output");
        return ["-i", o.input, "-i", o.audio, "-c:v", "copy", "-map", "0:v:0", "-map", "1:a:0", "-y", o.output];

      case "toGif":
        if (!o.output) throw new Error("toGif: missing output");
        return [
          "-ss", String(o.start!), "-t", String(o.duration!),
          "-i", o.input, "-vf", "fps=10,scale=320:-1:flags=lanczos", "-y", o.output
        ];

      case "clip":
        if (!o.output) throw new Error("clip: missing output");
        return ["-ss", String(o.start!), "-t", String(o.duration!), "-i", o.input, "-c", "copy", "-y", o.output];

      case "concat":
        if (!o.output) throw new Error("concat: missing output");
        return ["-i", `concat:${o.input}`, "-c", "copy", "-y", o.output];

      case "watermark":
        if (!o.watermark || !o.output) throw new Error("watermark: missing watermark/output");
        return ["-i", o.input, "-i", o.watermark, "-filter_complex", `overlay=${o.x}:${o.y}`, "-y", o.output];

      case "frames":
        if (!o.output) throw new Error("frames: missing output pattern");
        return ["-i", o.input, ...(o.fps ? ["-vf", `fps=${o.fps}`] : []), "-y", o.output];

      default:
        throw new Error(`Unknown job type: ${(o as any).type}`);
    }
  }

  private parseProgress(line: string): ProgressInfo | null {
    // Typical ffmpeg stderr sample fields:
    // frame=  240 fps= 30 q=-1.0 size=    1024kB time=00:00:08.00 bitrate=1048.6kbits/s speed=1.01x
    const frame = /frame=\s*(\d+)/.exec(line)?.[1];
    const fps = /fps=\s*([\d.]+)/.exec(line)?.[1];
    const kbps = /bitrate=\s*([\d.]+)kbits\/s/.exec(line)?.[1];
    const time = /time=\s*([0-9:.]+)/.exec(line)?.[1];

    if (!frame && !fps && !kbps && !time) return null;

    // percent requires total duration; if not known, leave 0
    let percent = 0;
    if (this.durationSec && time) {
      const [hh, mm, ss] = time.split(":");
      const cur = (+hh) * 3600 + (+mm) * 60 + parseFloat(ss);
      percent = Math.max(0, Math.min(100, (cur / this.durationSec) * 100));
    }

    return {
      frames: frame ? parseInt(frame, 10) : 0,
      currentFps: fps ? parseFloat(fps) : 0,
      currentKbps: kbps ? parseFloat(kbps) : 0,
      time,
      percent,
    };
  }
}
