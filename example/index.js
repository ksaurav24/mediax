import {MediaX} from '../packages/core/dist/index.js';

const media = new MediaX();

const job = media.convert('sample.mp4', 'output.mkv','matroska');

job.on("progress", (progress) => {
  console.log(`Progress: ${progress.percent}%`);
});

job.on("done", (output) => {
  console.log("Conversion completed:", output);
});

job.on("error", (err) => {
  console.error("Conversion error:", err.message);
});

job.start();
