import {MediaX} from '../packages/core/dist/index.js';

const media = new MediaX();

const job = media.pipeline()
  .convert("output.mkv", "matroska")
  .compress("output_compressed.mkv", "800k")
  .extractAudio("audio.aac", "aac")
  .thumbnail("thumb.png", "00:00:05")
  .run("sample.mp4")
  .on("progress", (percent, jobIndex, total, eta) =>
    console.log(`Pipeline: ${percent.toFixed(1)}% (Job ${jobIndex}/${total}) ETA: ${eta?.toFixed(1)}s`)
  )
  .on("done", () => console.log("Pipeline completed"))
  .on("error", (err, jobIndex) => console.error(`Error in job ${jobIndex}:`, err));