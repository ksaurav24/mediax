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
		ffmpeg.setFfmpegPath(ffmpegInstaller.path);
		ffmpeg.setFfprobePath(ffprobeInstaller.path);
	}

	// Fetch duration for accurate progress %
	private fetchDuration(): Promise<void> {
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(this.opts.input, (err, metadata) => {
				if (err) return reject(err);
				this.durationSeconds = metadata.format.duration || 0;
				resolve();
			});
		});
	}

	public async start(): Promise<void> {
		try {
			if (this.opts.type !== "metadata") {
				await this.fetchDuration();
			}

			let command = ffmpeg(this.opts.input);

			switch (this.opts.type) {
				case "convert":
					if (this.opts.format)
						command = command
							.output(this.opts.output!)
							.format(this.opts.format);
					else command = command.output(this.opts.output!);
					break;

				case "compress":
					command = command
						.output(this.opts.output!)
						.videoBitrate(this.opts.bitrate || "1000k");
					break;

				case "thumbnail":
					command = command.screenshots({
						timestamps: [this.opts.time || "00:00:01"],
						filename: this.opts.output!,
						folder: ".",
					});
					break;
				case "metadata":
					ffmpeg.ffprobe(this.opts.input, (err, metadata) => {
						if (err) this.emit("error", err);
						else this.emit("metadata", metadata);
					});
					return;
					return;

				case "extractAudio":
					command = command
						.noVideo()
						.output(this.opts.output!)
						.audioCodec(this.opts.codec || "aac");
					break;

				case "replaceAudio":
					command = command
						.input(this.opts.audio!)
						.output(this.opts.output!)
						.outputOptions(["-c:v copy", "-map 0:v:0", "-map 1:a:0"]);
					break;

				case "toGif":
					if (this.opts.start) command = command.setStartTime(this.opts.start);
					if (this.opts.duration)
						command = command.setDuration(this.opts.duration);
					command = command.output(this.opts.output!);
					break;

				case "clip":
					command = command
						.setStartTime(this.opts.start!)
						.setDuration(this.opts.duration!)
						.output(this.opts.output!);
					break;

				case "concat":
					command = command
						.input(`concat:${this.opts.input}`)
						.output(this.opts.output!);
					break;

				case "watermark":
					command = command
						.complexFilter([
							{
								filter: "overlay",
								options: { x: this.opts.x || 10, y: this.opts.y || 10 },
							},
						])
						.output(this.opts.output!);
					break;

				case "frames":
					if (this.opts.fps) command = command.fps(this.opts.fps);
					command = command.output(this.opts.output!);
					break;

				default:
					throw new Error(`Unknown job type: ${this.opts.type}`);
			}
			let lastPercent = 0;

			(command as any)
				.on("start", (cmdLine: string) => this.emit("start", cmdLine))
				.on("progress", (progress: ProgressInfo & { timemark?: string }) => {
					if (!this.durationSeconds || !progress.timemark) return;

					const currentPercent = Math.min(
						(parseTimeToSeconds(progress.timemark) / this.durationSeconds) *
							100,
						100
					);

					if (currentPercent - lastPercent >= 1) {
						// emit only every 1% change
						lastPercent = currentPercent;
						this.emit("progress", { ...progress, percent: Number(currentPercent.toFixed(2)) });
					}
				})
				.on("end", () => this.emit("done", this.opts.output))
				.on("error", (err: Error) => this.emit("error", err))
				.run();
		} catch (err) {
			this.emit("error", err as Error);
		}
	}
}
