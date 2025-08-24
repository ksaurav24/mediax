import { describe, it, expect, vi } from "vitest";
import { MediaX } from "../mediax";
import { Job } from "../job";

describe("MediaX SDK", () => {
  it("should create a Job instance for convert", () => {
    const mx = new MediaX();
    const job = mx.convert("input.mp4", "output.mkv", "matroska");
    expect(job).toBeInstanceOf(Job);
  });

  it("should emit progress and done events", async () => {
    const mx = new MediaX();

    // mock job using fluent-ffmpeg not actually running
    const job = mx.convert("input.mp4", "output.mkv", "matroska");

    const progressSpy = vi.fn();
    const doneSpy = vi.fn();

    job.on("progress", progressSpy);
    job.on("done", doneSpy);

    // simulate
    job.emit("progress", { percent: 50, frames: 100, currentFps: 25, currentKbps: 1000 });
    job.emit("done", "output.mkv");

    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 50 })
    );
    expect(doneSpy).toHaveBeenCalledWith("output.mkv");
  });
});
