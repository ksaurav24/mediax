import { Job } from "./job";
import { Pipeline } from "./pipeline";
import { JobOptions, MediaXError, ERROR_CODES, JobType } from "./types";

export class MediaX {
    private activeJobs: Set<Job> = new Set();
    private activePipelines: Set<Pipeline> = new Set();

    constructor() {}

    private createJob(opts: JobOptions): Job {
        const job = new Job(opts); // Job handles duration & progress internally

        // Track active jobs for monitoring
        this.activeJobs.add(job);

        // Cleanup on job completion
        job.on('done', () => this.activeJobs.delete(job));
        job.on('error', () => this.activeJobs.delete(job));

        return job;
    }

    // Get status of active operations
    getActiveOperationsCount(): { jobs: number; pipelines: number } {
        return {
            jobs: this.activeJobs.size,
            pipelines: this.activePipelines.size
        };
    }

    // Check if any operations are running
    isRunning(): boolean {
        return this.activeJobs.size > 0 || this.activePipelines.size > 0;
    }

    // Pipeline method with tracking
    pipeline(initialInput?: string): Pipeline {
        const pipeline = new Pipeline(this);
        
        // Track active pipelines
        this.activePipelines.add(pipeline);

        // Cleanup on pipeline completion
        pipeline.on('done', () => this.activePipelines.delete(pipeline));
        pipeline.on('error', () => this.activePipelines.delete(pipeline));

        if (initialInput) {
            pipeline.setInput(initialInput);
        }
        return pipeline;
    }

    // ---- Core Methods with Enhanced Error Handling ----
    convert(input: string, output: string, format?: string): Job {
        this.validateInputs(input, output, 'convert');
        return this.createJob({ type: "convert", input, output, format });
    }

    compress(input: string, output: string, bitrate: string = "1000k"): Job {
        this.validateInputs(input, output, 'compress');
        this.validateBitrate(bitrate);
        return this.createJob({ type: "compress", input, output, bitrate });
    }

    thumbnail(input: string, output: string, time: string = "00:00:01"): Job {
        this.validateInputs(input, output, 'thumbnail');
        this.validateTimestamp(time);
        return this.createJob({ type: "thumbnail", input, output, time });
    }

    metadata(input: string): Job {
        this.validateInput(input, 'metadata');
        return this.createJob({ type: "metadata", input });
    }

    extractAudio(input: string, output: string, codec: string = "mp3"): Job {
        this.validateInputs(input, output, 'extractAudio');
        this.validateAudioCodec(codec);
        return this.createJob({ type: "extractAudio", input, output, codec });
    }

    replaceAudio(video: string, audio: string, output: string): Job {
        this.validateInput(video, 'replaceAudio');
        this.validateInput(audio, 'replaceAudio');
        if (!output?.trim()) {
            throw new MediaXError('Output path cannot be empty', ERROR_CODES.INVALID_PARAMS, 'replaceAudio');
        }
        return this.createJob({
            type: "replaceAudio",
            input: video,
            output,
            audio,
        });
    }

    toGif(
        input: string,
        output: string,
        opts: { start?: number; duration?: number } = {}
    ): Job {
        this.validateInputs(input, output, 'toGif');
        this.validateGifOptions(opts);
        return this.createJob({ type: "toGif", input, output, ...opts });
    }

    clip(
        input: string,
        output: string,
        opts: { start?: number; duration?: number }
    ): Job {
        this.validateInputs(input, output, 'clip');
        this.validateClipOptions(opts);
        return this.createJob({ type: "clip", input, output, ...opts });
    }

    concat(inputs: string[], output: string): Job {
        if (!inputs || inputs.length === 0) {
            throw new MediaXError('At least one input file is required', ERROR_CODES.INVALID_PARAMS, 'concat');
        }
        
        // Validate all input files exist
        inputs.forEach((input, index) => {
            this.validateInput(input, 'concat', `Input ${index + 1}`);
        });

        if (!output?.trim()) {
            throw new MediaXError('Output path cannot be empty', ERROR_CODES.INVALID_PARAMS, 'concat');
        }

        return this.createJob({ type: "concat", input: inputs.join(","), output });
    }

    addWatermark(
        input: string,
        watermark: string,
        output: string,
        position: { x: number; y: number } = { x: 10, y: 10 }
    ): Job {
        this.validateInputs(input, output, 'watermark');
        this.validateInput(watermark, 'watermark', 'Watermark file');
        this.validateWatermarkPosition(position);
        
        return this.createJob({
            type: "watermark",
            input,
            output,
            watermark,
            ...position,
        });
    }

    extractFrames(
        input: string,
        pattern: string,
        opts: { fps?: number } = {}
    ): Job {
        this.validateInput(input, 'frames');
        if (!pattern?.trim()) {
            throw new MediaXError('Output pattern cannot be empty', ERROR_CODES.INVALID_PARAMS, 'frames');
        }
        this.validateFrameOptions(opts);
        
        return this.createJob({ type: "frames", input, output: pattern, ...opts });
    }

    // ---- Validation Helper Methods ----
    private validateInput(input: string, jobType: JobType, label: string = 'Input file'): void {
        if (!input?.trim()) {
            throw new MediaXError(`${label} path cannot be empty`, ERROR_CODES.INVALID_PARAMS, jobType);
        }

        // Check file existence (will be further validated in Job class)
        const fs = require('fs');
        if (!fs.existsSync(input)) {
            throw new MediaXError(`${label} does not exist: ${input}`, ERROR_CODES.FILE_NOT_FOUND, jobType);
        }
    }

    private validateInputs(input: string, output: string, jobType: JobType): void {
        this.validateInput(input, jobType);
        if (!output?.trim()) {
            throw new MediaXError('Output path cannot be empty', ERROR_CODES.INVALID_PARAMS, jobType);
        }
    }

    private validateBitrate(bitrate: string): void {
        if (!/^\d+[kKmM]?$/.test(bitrate)) {
            throw new MediaXError(
                `Invalid bitrate format: ${bitrate}. Use format like '800k', '1M'`,
                ERROR_CODES.INVALID_PARAMS,
                'compress'
            );
        }
    }

    private validateTimestamp(time: string): void {
        if (!/^(?:\d+(?:\.\d+)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.test(time)) {
            throw new MediaXError(
                `Invalid timestamp format: ${time}. Use HH:MM:SS or seconds`,
                ERROR_CODES.INVALID_PARAMS,
                'thumbnail'
            );
        }
    }

    private validateAudioCodec(codec: string): void {
        const supportedCodecs = ['aac', 'mp3', 'wav', 'flac', 'ogg', 'ac3'];
        if (!supportedCodecs.includes(codec.toLowerCase())) {
            throw new MediaXError(
                `Unsupported audio codec: ${codec}. Supported: ${supportedCodecs.join(', ')}`,
                ERROR_CODES.CODEC_NOT_SUPPORTED,
                'extractAudio'
            );
        }
    }

    private validateGifOptions(opts: { start?: number; duration?: number }): void {
        if (opts.start !== undefined && opts.start < 0) {
            throw new MediaXError('GIF start time cannot be negative', ERROR_CODES.INVALID_PARAMS, 'toGif');
        }
        if (opts.duration !== undefined && opts.duration <= 0) {
            throw new MediaXError('GIF duration must be positive', ERROR_CODES.INVALID_PARAMS, 'toGif');
        }
    }

    private validateClipOptions(opts: { start?: number; duration?: number }): void {
        if (opts.start !== undefined && opts.start < 0) {
            throw new MediaXError('Clip start time cannot be negative', ERROR_CODES.INVALID_PARAMS, 'clip');
        }
        if (opts.duration !== undefined && opts.duration <= 0) {
            throw new MediaXError('Clip duration must be positive', ERROR_CODES.INVALID_PARAMS, 'clip');
        }
    }

    private validateWatermarkPosition(position: { x: number; y: number }): void {
        if (position.x < 0 || position.y < 0) {
            throw new MediaXError('Watermark position cannot be negative', ERROR_CODES.INVALID_PARAMS, 'watermark');
        }
    }

    private validateFrameOptions(opts: { fps?: number }): void {
        if (opts.fps !== undefined && (opts.fps <= 0 || opts.fps > 120)) {
            throw new MediaXError('FPS must be between 1 and 120', ERROR_CODES.INVALID_PARAMS, 'frames');
        }
    }

    // ---- Utility Methods ----
    
    // Get detailed status
    getStatus(): {
        activeJobs: number;
        activePipelines: number;
        isRunning: boolean;
        totalOperations: number;
    } {
        const activeJobs = this.activeJobs.size;
        const activePipelines = this.activePipelines.size;
        
        return {
            activeJobs,
            activePipelines,
            isRunning: activeJobs > 0 || activePipelines > 0,
            totalOperations: activeJobs + activePipelines
        };
    }
}

