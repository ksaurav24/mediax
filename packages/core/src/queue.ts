import { Job } from "./job";
import TypedEmitter from "typed-emitter";

export type QueueEventMap = {
  jobStart: (job: Job) => void;
  jobProgress: (job: Job, progress: any) => void;
  jobDone: (job: Job) => void;
  jobError: (job: Job, error: Error) => void;
  empty: () => void;
};

export class Queue extends (require("events").EventEmitter as new () => TypedEmitter<QueueEventMap>) {
  private concurrency: number;
  private running: number = 0;
  private jobs: Job[] = [];

  constructor(concurrency: number = 2) {
    super();
    this.concurrency = concurrency;
  }

  add(job: Job) {
    this.jobs.push(job);
    this.next();
  }

  private next() {
    if (this.running >= this.concurrency || this.jobs.length === 0) return;

    const job = this.jobs.shift()!;
    this.running++;

    this.emit("jobStart", job);

    job.on("progress", (p) => this.emit("jobProgress", job, p));
    job.on("done", () => {
      this.running--;
      this.emit("jobDone", job);
      this.next();
      if (this.running === 0 && this.jobs.length === 0) this.emit("empty");
    });
    job.on("error", (err) => {
      this.running--;
      this.emit("jobError", job, err);
      this.next();
      if (this.running === 0 && this.jobs.length === 0) this.emit("empty");
    });

    job.start();
  }
}
