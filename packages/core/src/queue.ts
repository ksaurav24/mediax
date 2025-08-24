import { EventEmitter } from "events";
import { Job } from "./job";

export interface QueueOptions {
  concurrency?: number;   // parallel workers
  maxRetries?: number;    // per-job retries
  backoffMs?: number;     // fixed backoff between retries
}

type Entry = {
  job: Job;
  tries: number;
};

export class JobQueue extends EventEmitter {
  private q: Entry[] = [];
  private running = 0;
  private stopped = false;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;

  constructor(opts: QueueOptions = {}) {
    super();
    this.concurrency = opts.concurrency ?? 2;
    this.maxRetries = opts.maxRetries ?? 0;
    this.backoffMs = opts.backoffMs ?? 0;
  }

  size(): number { return this.q.length; }
  isIdle(): boolean { return this.running === 0 && this.q.length === 0; }

  add(job: Job) {
    const entry: Entry = { job, tries: 0 };
    this.q.push(entry);

    // bubble job events
    job.on("state", (s) => this.emit("job:state", job.id, s));
    job.on("progress", (p) => this.emit("job:progress", job.id, p));
    job.on("done", (out) => this.emit("job:done", job.id, out));
    job.on("error", (err) => this.emit("job:error", job.id, err));

    this.tick();
    return job.id;
  }

  pause() { this.stopped = true; }
  resume() { this.stopped = false; this.tick(); }

  cancel(jobId: string) {
    // if in queue, remove; if running, call cancel
    const idx = this.q.findIndex(e => e.job.id === jobId);
    if (idx >= 0) {
      const [e] = this.q.splice(idx, 1);
      e.job.cancel("removed");
      return true;
    }
    // running job
    this.emit("job:cancel", jobId);
    return false;
  }

  private tick() {
    if (this.stopped) return;
    while (this.running < this.concurrency && this.q.length > 0) {
      const entry = this.q.shift()!;
      this.runEntry(entry);
    }
  }

  private runEntry(entry: Entry) {
    this.running++;
    const { job } = entry;

    const onDone = () => {
      cleanup();
      this.running--;
      this.tick();
    };

    const onError = async () => {
      cleanup();
      if (entry.tries < this.maxRetries) {
        entry.tries++;
        if (this.backoffMs) await new Promise(r => setTimeout(r, this.backoffMs));
        this.q.unshift(entry); // retry asap
      }
      this.running--;
      this.tick();
    };

    const cleanup = () => {
      job.off("done", onDone);
      job.off("error", onError);
    };

    job.once("done", onDone);
    job.once("error", onError);
    job.start();
  }
}
