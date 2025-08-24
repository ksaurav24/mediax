import {MediaX} from 'mediax-sdk'

const media = new MediaX();

const job = media.convert('sample.mp4', 'output.mkv', 'mkv');

job.on("progress", (progress) => {
  console.log(`Progress: ${JSON.stringify(progress)}%`);
});

job.on("done", (output) => {
  console.log("Conversion completed:", output);
});

job.on("error", (err) => {
  console.error("Conversion error:", err.message);
});

job.start();
