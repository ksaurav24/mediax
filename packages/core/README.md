
# MediaX SDK

**MediaX SDK** is a Node.js TypeScript library for high-level video/audio/media processing built on `ffmpeg`. It provides a simple, typed interface to **convert, compress, extract audio, generate thumbnails, clip, GIF conversion, watermark, frames extraction**, and more. It supports **real-time progress**, **accurate percent calculation**, and **job queues** for production-grade pipelines.

---

## Features

- Convert video/audio formats
- Compress videos with bitrate control
- Extract audio tracks
- Replace audio in video
- Generate thumbnails at specific timestamps
- Clip or segment videos
- Convert video segments to GIF
- Concatenate multiple videos
- Add image watermarks
- Extract frames as an image sequence
- Retrieve media metadata
- **Real-time progress events** with accurate percentage
- **Typed events** for TypeScript safety
- **Job queue support** for concurrent processing

---

## Installation

```bash
# Using npm
npm install mediax-sdk

# Using pnpm
pnpm add mediax-sdk
````

> Make sure `ffmpeg` is installed on your system.
> On Windows, you can download it from [FFmpeg.org](https://ffmpeg.org/download.html).
> On Mac/Linux, you can use `brew install ffmpeg` or your package manager.

---

## Quick Start

```ts
import { MediaX } from "mediax-sdk";

const mx = new MediaX();

// Convert video
const job = mx.convert("input.mp4", "output.mkv");

job.on("start", (cmd) => console.log("Started:", cmd));
job.on("progress", (p) => console.log(`Progress: ${p.percent?.toFixed(1)}%`));
job.on("done", (output) => console.log("Done:", output));
job.on("error", (err) => console.error("Error:", err));

job.start();
```

---

## Supported Methods

| Method                                               | Description                             |
| ---------------------------------------------------- | --------------------------------------- |
| `convert(input, output, format?)`                    | Convert video/audio to specified format |
| `compress(input, output, bitrate?)`                  | Compress video with bitrate             |
| `thumbnail(input, output, time?)`                    | Generate thumbnail at time              |
| `metadata(input)`                                    | Get media metadata                      |
| `extractAudio(input, output, codec?)`                | Extract audio track                     |
| `replaceAudio(video, audio, output)`                 | Replace audio track in video            |
| `toGif(input, output, { start?, duration? })`        | Convert video segment to GIF            |
| `clip(input, output, { start?, duration? })`         | Clip video segment                      |
| `concat(inputs[], output)`                           | Concatenate multiple videos             |
| `addWatermark(input, watermark, output, { x?, y? })` | Add image watermark                     |
| `extractFrames(input, pattern, { fps? })`            | Extract frames as images                |

---

## Events

Each job emits typed events:

* `start(cmdLine: string)` → FFmpeg command started
* `progress(progress: ProgressInfo)` → Progress update with percent, frames, fps, kbps
* `done(output?: string)` → Job completed
* `error(err: Error)` → Job failed

```ts
job.on("progress", p => console.log(`Percent: ${p.percent?.toFixed(1)}%`));
```

---

## Job Queue

Run multiple jobs concurrently:

```ts
import { Queue } from "mediax-sdk";

const queue = new Queue(2); // 2 concurrent jobs

queue.add(mx.convert("a.mp4", "a_out.mkv"));
queue.add(mx.compress("b.mp4", "b_out.mp4"));
queue.add(mx.toGif("c.mp4", "c.gif", { start: 1, duration: 5 }));

queue.on("jobProgress", (job, progress) => console.log(`${job.opts.input}: ${progress.percent?.toFixed(1)}%`));
queue.on("jobDone", (job) => console.log(`${job.opts.input} done`));
queue.on("empty", () => console.log("All jobs completed"));
```

---

## ProgressInfo Type

```ts
export interface ProgressInfo {
  percent?: number;
  frames?: number;
  currentFps?: number;
  currentKbps?: number;
  time?: string;
}
```

---

## Development

Clone and build:

```bash
git clone https://github.com/ksaurav24/mediax.git
cd mediax/packages/core
pnpm install
pnpm build
```

Run tests:

```bash
pnpm test
```

---

## Notes

* `ffmpeg` and `ffprobe` are automatically configured using `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`.
* Percent progress is **accurate** using `ffprobe` to fetch media duration.
* All events are **typed for TypeScript**, preventing common runtime errors.
* Designed for **production pipelines** with queue and concurrent processing support.

