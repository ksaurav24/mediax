 
# MediaX SDK Monorepo

This repository contains **MediaX SDK**, a Node.js/TypeScript library for high-level video/audio/media processing built on `ffmpeg`.  
The project is structured as a monorepo using `pnpm` workspaces.

---

## Repository Structure

```

mediax-sdk/
├─ example/            # Under development
├─ cli/                # Under development
├─ packages/
│  └─ core/            # Core MediaX SDK package
│     ├─ src/          # Source code (MediaX, Job, Queue, types)
│     ├─ package.json  # Core package metadata
│     ├─ tsconfig.json # TypeScript config
│     └─ **tests**/    # Unit tests
├─ pnpm-workspace.yaml # Workspace configuration
└─ README.md           # Root-level readme
 ```
---

## Packages

### `@mediax/core`

The main SDK package containing:

- `MediaX` class: High-level methods for conversion, compression, thumbnail generation, audio extraction, GIF creation, clipping, watermarking, and more.
- `Job` class: Typed events, real-time progress, automatic duration calculation.
- `Queue` class: Concurrency-controlled job queue for production pipelines.
- `types`: TypeScript definitions for all jobs and events.

---

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/ksaurav24/mediax.git
cd mediax
````

2. Install dependencies with `pnpm`:

```bash
pnpm install
```

3. Build the core package:

```bash
pnpm --filter @mediax/core build
```

4. Run tests:

```bash
pnpm --filter @mediax/core test
```

---

## Usage Example (from `packages/core`)

```ts
import { MediaX, Queue } from "@mediax/core";

const mx = new MediaX();
const job = mx.convert("input.mp4", "output.mkv");

job.on("progress", p => console.log(`Progress: ${p.percent?.toFixed(1)}%`));
job.on("done", output => console.log("Done:", output));
job.start();

// Queue example
const queue = new Queue(2);
queue.add(mx.compress("input1.mp4", "out1.mp4"));
queue.add(mx.toGif("input2.mp4", "out2.gif"));
queue.on("empty", () => console.log("All jobs completed"));
```

---

## Development Notes

* The project uses **pnpm workspaces** to manage packages.
* `ffmpeg` and `ffprobe` are automatically configured via `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`.
* All events are typed for TypeScript.
* Supports production pipelines with queues and concurrent jobs.

---

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Add tests for any new functionality.
4. Submit a pull request.

---

## License

MIT License – see [`LICENSE`](./LICENSE) for details.

 