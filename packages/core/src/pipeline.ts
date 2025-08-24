import { Job } from "./job";
import { 
    JobOptions, 
    ProgressInfo, 
    MediaXError, 
    MediaXValidationError, 
    MediaXFFmpegError,
    ERROR_CODES,
    JobType 
} from "./types";
import TypedEmitter from "typed-emitter";
import * as fs from 'fs';
import * as path from 'path';

export type PipelineEventMap = {
    progress: (
        percent: number,
        currentJob: number,
        totalJobs: number,
        eta?: number
    ) => void;
    done: () => void;
    error: (err: MediaXError, jobIndex: number) => void;
    jobStart: (jobType: JobType, jobIndex: number) => void;
    jobComplete: (jobType: JobType, jobIndex: number, output: string) => void;
    warning: (message: string, jobType?: JobType) => void;
};

interface PipelineStep extends JobOptions {}

export class Pipeline extends (require("events")
    .EventEmitter as new () => TypedEmitter<PipelineEventMap>) {
    private steps: PipelineStep[] = [];
    private jobs: Job[] = [];
    private initialInput: string = "";
    private isRunning: boolean = false;
    private aborted: boolean = false;

    // Job type categorization for smart routing
    private static readonly VIDEO_OPERATIONS = new Set<JobType>([
        "convert", "compress", "clip", "watermark", "toGif", "replaceAudio"
    ]);
    
    private static readonly AUDIO_OPERATIONS = new Set<JobType>([
        "extractAudio"
    ]);

    private static readonly VIDEO_REQUIRED_OPERATIONS = new Set<JobType>([
        "thumbnail", "watermark", "toGif", "clip", "convert", "compress"
    ]);

    constructor(private mediaXInstance: any) {
        super();
    }

    setInput(input: string): Pipeline {
        this.validateNotRunning();
        this.initialInput = input;
        return this;
    }

    addStep(step: PipelineStep): Pipeline {
        this.validateNotRunning();
        this.steps.push(step);
        return this;
    }

    // Pipeline builder methods with validation
    convert(output: string, format?: string): Pipeline {
        this.validateOutput(output, 'convert');
        return this.addStep({ type: "convert", input: "", output, format });
    }

    compress(output: string, bitrate?: string): Pipeline {
        this.validateOutput(output, 'compress');
        this.validateBitrate(bitrate);
        return this.addStep({ type: "compress", input: "", output, bitrate });
    }

    thumbnail(output: string, time?: string): Pipeline {
        this.validateOutput(output, 'thumbnail');
        this.validateTimestamp(time);
        return this.addStep({ type: "thumbnail", input: "", output, time });
    }

    extractAudio(output: string, codec: string = "aac"): Pipeline {
        this.validateOutput(output, 'extractAudio');
        this.validateAudioCodec(codec);
        return this.addStep({ type: "extractAudio", input: "", output, codec });
    }

    replaceAudio(output: string, audio: string): Pipeline {
        this.validateOutput(output, 'replaceAudio');
        this.validateAudioFile(audio);
        return this.addStep({ type: "replaceAudio", input: "", output, audio });
    }

    toGif(output: string, opts: { start?: number; duration?: number } = {}): Pipeline {
        this.validateOutput(output, 'toGif');
        this.validateGifOptions(opts);
        return this.addStep({ type: "toGif", input: "", output, ...opts });
    }

    clip(output: string, opts: { start: number; duration: number }): Pipeline {
        this.validateOutput(output, 'clip');
        this.validateClipOptions(opts);
        return this.addStep({ type: "clip", input: "", output, ...opts });
    }

    concat(output: string): Pipeline {
        this.validateOutput(output, 'concat');
        return this.addStep({ type: "concat", input: "", output });
    }

    addWatermark(
        output: string,
        watermark: string,
        position: { x?: number; y?: number } = { x: 10, y: 10 }
    ): Pipeline {
        this.validateOutput(output, 'watermark');
        this.validateWatermarkFile(watermark);
        return this.addStep({
            type: "watermark",
            input: "",
            output,
            watermark,
            ...position,
        });
    }

    extractFrames(output: string, opts: { fps?: number } = {}): Pipeline {
        this.validateOutput(output, 'frames');
        this.validateFrameOptions(opts);
        return this.addStep({ type: "frames", input: "", output, ...opts });
    }

    // Abort pipeline execution
    abort(): void {
        if (!this.isRunning) return;
        
        this.aborted = true;
         
        
        this.emit('error', new MediaXError(
            'Pipeline aborted by user', 
            ERROR_CODES.PIPELINE_ABORTED
        ), -1);
    }

    // Main execution method
    run(input?: string): Pipeline {
        if (input) this.initialInput = input;
        
        // Prevent multiple concurrent runs
        if (this.isRunning) {
            process.nextTick(() => {
                this.emit('error', new MediaXError(
                    'Pipeline is already running', 
                    ERROR_CODES.PIPELINE_RUNNING
                ), 0);
            });
            return this;
        }

        // Pre-flight validation
        try {
            this.validatePipeline();
        } catch (err) {
            process.nextTick(() => {
                this.emit('error', this.enhanceError(err as Error, 0), 0);
            });
            return this;
        }

        this.isRunning = true;
        this.aborted = false;
        this.executePipeline().finally(() => {
            this.isRunning = false;
        });

        return this;
    }

    // Core pipeline execution logic
    private async executePipeline(): Promise<void> {
        let lastOutput = this.initialInput;
        const totalJobs = this.steps.length;
        const pipelineStartTime = Date.now();

        try {
            for (let i = 0; i < totalJobs && !this.aborted; i++) {
                const step = this.steps[i];
                
                // Resolve input for current step
                step.input = this.resolveJobInput(step, i, lastOutput);
                
                // Generate default output if missing
                if (!step.output) {
                    step.output = this.generateDefaultOutput(step.type, i);
                }

                // Create and execute job
                await this.executeJob(step, i, totalJobs);
                lastOutput = step.output!;
            }

            if (!this.aborted) {
                const totalTime = (Date.now() - pipelineStartTime) / 1000;
                console.log(`Pipeline completed in ${totalTime.toFixed(2)}s`);
                this.emit("done");
            }

        } catch (err) {
            const enhancedError = this.enhanceError(err as Error, -1);
            this.emit("error", enhancedError, -1);
        }
    }

    // Execute individual job with comprehensive error handling
    private async executeJob(step: PipelineStep, index: number, totalJobs: number): Promise<void> {
        if (this.aborted) return;

        const job: Job = this.mediaXInstance.createJob(step);
        this.jobs[index] = job;

        let jobStartTime = Date.now();
        let lastPercent = 0;

        this.emit('jobStart', step.type, index + 1);

        return new Promise<void>((resolve, reject) => {
            // Job timeout protection (configurable per job type)
            const timeoutDuration = this.getJobTimeout(step.type);
            const timeout = setTimeout(() => {
                this.cleanup();
                reject(new MediaXError(
                    `Job ${index + 1} (${step.type}) timed out after ${timeoutDuration / 60000} minutes`, 
                    ERROR_CODES.JOB_TIMEOUT,
                    step.type
                ));
            }, timeoutDuration);

            job.on("progress", (p: ProgressInfo & { timemark?: string }) => {
                if (this.aborted) return;
                
                try {
                    this.handleJobProgress(p, job, index, totalJobs, jobStartTime, lastPercent);
                } catch (err) {
                    this.emit('warning', `Progress calculation error: ${(err as Error).message}`, step.type);
                }
            });

            job.on("done", (output) => {
                clearTimeout(timeout);
                const jobTime = (Date.now() - jobStartTime) / 1000;
                console.log(`Job ${index + 1} (${step.type}) completed in ${jobTime.toFixed(2)}s`);
                this.emit('jobComplete', step.type, index + 1, output || step.output!);
                resolve();
            });

            job.on("error", (err) => {
                clearTimeout(timeout);
                const enhancedError = this.enhanceJobError(err, step.type, index + 1);
                reject(enhancedError);
            });

            // Start the job
            try {
                job.start();
            } catch (err) {
                clearTimeout(timeout);
                reject(this.enhanceError(err as Error, index + 1));
            }
        });
    }

    // Smart input resolution with validation
    private resolveJobInput(step: PipelineStep, index: number, lastOutput: string): string {
        if (Pipeline.VIDEO_REQUIRED_OPERATIONS.has(step.type) && step.type === 'thumbnail') {
            // For thumbnail, find the most recent video-producing step
            for (let j = index - 1; j >= 0; j--) {
                const prevStep = this.steps[j];
                if (Pipeline.VIDEO_OPERATIONS.has(prevStep.type)) {
                    return prevStep.output!;
                }
            }
            return this.initialInput; // Fallback to original input
        }
        return lastOutput; // Normal sequential flow
    }

    // Enhanced progress handling with better error resilience
    private handleJobProgress(
        p: ProgressInfo & { timemark?: string }, 
        job: Job, 
        index: number, 
        totalJobs: number, 
        jobStartTime: number, 
        lastPercent: number
    ): void {
        const duration = job.getDuration();
        if (!duration || !p.timemark) return;
        
        const currentPercent = Math.min(
            (parseTimeToSeconds(p.timemark) / duration) * 100,
            100
        );

        if (currentPercent - lastPercent >= 1) {
            const elapsed = (Date.now() - jobStartTime) / 1000;
            const eta = currentPercent > 0 
                ? elapsed / (currentPercent / 100) - elapsed 
                : undefined;
            const overallPercent = ((index + currentPercent / 100) / totalJobs) * 100;
            
            this.emit("progress", overallPercent, index + 1, totalJobs, eta);
        }
    }

    // Get timeout duration based on job type
    private getJobTimeout(jobType: JobType): number {
        const timeouts: Record<JobType, number> = {
            convert: 15 * 60 * 1000,      // 15 minutes
            compress: 20 * 60 * 1000,     // 20 minutes
            thumbnail: 2 * 60 * 1000,     // 2 minutes
            extractAudio: 5 * 60 * 1000,  // 5 minutes
            replaceAudio: 10 * 60 * 1000, // 10 minutes
            toGif: 10 * 60 * 1000,        // 10 minutes
            clip: 5 * 60 * 1000,          // 5 minutes
            concat: 15 * 60 * 1000,       // 15 minutes
            watermark: 10 * 60 * 1000,    // 10 minutes
            frames: 20 * 60 * 1000,       // 20 minutes
            metadata: 30 * 1000           // 30 seconds
        };

        return timeouts[jobType] || 10 * 60 * 1000; // Default 10 minutes
    }

    // Validation methods
    private validatePipeline(): void {
        if (!this.initialInput?.trim()) {
            throw new MediaXValidationError("Pipeline input not set");
        }

        if (!fs.existsSync(this.initialInput)) {
            throw new MediaXValidationError(
                `Input file does not exist: ${this.initialInput}`,
                undefined
            );
        }

        if (this.steps.length === 0) {
            throw new MediaXValidationError("Pipeline has no steps defined");
        }

        // Check file accessibility
        try {
            fs.accessSync(this.initialInput, fs.constants.R_OK);
        } catch {
            throw new MediaXValidationError(
                `Cannot read input file: ${this.initialInput}`,
                undefined
            );
        }

        this.validateStepSequence();
        this.validateOutputPaths();
    }

    private validateStepSequence(): void {
        for (let i = 0; i < this.steps.length; i++) {
            const step = this.steps[i];
            
            // Warn about potential issues
            if (i > 0) {
                const prevStep = this.steps[i - 1];
                if (Pipeline.AUDIO_OPERATIONS.has(prevStep.type) && 
                    Pipeline.VIDEO_REQUIRED_OPERATIONS.has(step.type) && 
                    step.type !== 'thumbnail') {
                    this.emit('warning', 
                        `${step.type} after ${prevStep.type} may fail - no video stream available`,
                        step.type
                    );
                }
            }
        }
    }

    private validateOutputPaths(): void {
        const outputs = new Set<string>();
        
        for (const step of this.steps) {
            if (step.output) {
                if (outputs.has(step.output)) {
                    throw new MediaXValidationError(
                        `Duplicate output path: ${step.output}`,
                        step.type
                    );
                }
                outputs.add(step.output);
                
                // Ensure output directory exists or can be created
                const outputDir = path.dirname(step.output);
                if (!fs.existsSync(outputDir)) {
                    try {
                        fs.mkdirSync(outputDir, { recursive: true });
                    } catch (err: any) {
                        throw new MediaXValidationError(
                            `Cannot create output directory: ${outputDir}`,
                            step.type
                        );
                    }
                }
            }
        }
    }

    // Enhanced individual validation helpers
    private validateNotRunning(): void {
        if (this.isRunning) {
            throw new MediaXValidationError("Cannot modify pipeline while running");
        }
    }

    private validateOutput(output: string, jobType?: JobType): void {
        if (!output?.trim()) {
            throw new MediaXValidationError("Output path cannot be empty", jobType);
        }
        
        // Validate file extension matches job type
        const ext = path.extname(output).toLowerCase();
        const validExtensions = this.getValidExtensions(jobType);
        
        if (validExtensions.length > 0 && !validExtensions.includes(ext)) {
            this.emit('warning', 
                `Output extension '${ext}' may not be optimal for ${jobType} operation. ` +
                `Consider: ${validExtensions.join(', ')}`,
                jobType
            );
        }
    }

    private getValidExtensions(jobType?: JobType): string[] {
        const extensions: Record<JobType, string[]> = {
            convert: ['.mp4', '.mkv', '.avi', '.mov'],
            compress: ['.mp4', '.mkv', '.avi'],
            thumbnail: ['.png', '.jpg', '.jpeg'],
            extractAudio: ['.aac', '.mp3', '.wav', '.flac'],
            replaceAudio: ['.mp4', '.mkv', '.avi', '.mov'],
            toGif: ['.gif'],
            clip: ['.mp4', '.mkv', '.avi', '.mov'],
            concat: ['.mp4', '.mkv', '.avi', '.mov'],
            watermark: ['.mp4', '.mkv', '.avi', '.mov'],
            frames: ['.png', '.jpg', '.jpeg'],
            metadata: []
        };

        return jobType ? extensions[jobType] || [] : [];
    }

    private validateBitrate(bitrate?: string): void {
        if (bitrate && !/^\d+[kKmM]?$/.test(bitrate)) {
            throw new MediaXValidationError(
                `Invalid bitrate format: ${bitrate}. Use format like '800k', '1M'`,
                'compress'
            );
        }
    }

    private validateTimestamp(time?: string): void {
        if (time && !/^(?:\d+(?:\.\d+)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.test(time)) {
            throw new MediaXValidationError(
                `Invalid timestamp format: ${time}. Use HH:MM:SS or seconds`,
                'thumbnail'
            );
        }
    }

    private validateAudioCodec(codec: string): void {
        const supportedCodecs = ['aac', 'mp3', 'wav', 'flac', 'ogg', 'ac3'];
        if (!supportedCodecs.includes(codec.toLowerCase())) {
            throw new MediaXValidationError(
                `Unsupported audio codec: ${codec}. Supported: ${supportedCodecs.join(', ')}`,
                'extractAudio'
            );
        }
    }

    private validateAudioFile(audioPath: string): void {
        if (!fs.existsSync(audioPath)) {
            throw new MediaXValidationError(
                `Audio file does not exist: ${audioPath}`,
                'replaceAudio'
            );
        }
    }

    private validateGifOptions(opts: { start?: number; duration?: number }): void {
        if (opts.start !== undefined && opts.start < 0) {
            throw new MediaXValidationError("GIF start time cannot be negative", 'toGif');
        }
        if (opts.duration !== undefined && opts.duration <= 0) {
            throw new MediaXValidationError("GIF duration must be positive", 'toGif');
        }
        if (opts.duration !== undefined && opts.duration > 30) {
            this.emit('warning', 'GIF duration > 30s may result in large files', 'toGif');
        }
    }

    private validateClipOptions(opts: { start: number; duration: number }): void {
        if (opts.start < 0) {
            throw new MediaXValidationError("Clip start time cannot be negative", 'clip');
        }
        if (opts.duration <= 0) {
            throw new MediaXValidationError("Clip duration must be positive", 'clip');
        }
    }

    private validateWatermarkFile(watermarkPath: string): void {
        if (!fs.existsSync(watermarkPath)) {
            throw new MediaXValidationError(
                `Watermark file does not exist: ${watermarkPath}`,
                'watermark'
            );
        }
    }

    private validateFrameOptions(opts: { fps?: number }): void {
        if (opts.fps !== undefined && (opts.fps <= 0 || opts.fps > 60)) {
            throw new MediaXValidationError("FPS must be between 1 and 60", 'frames');
        }
    }

    // Enhanced error methods using ERROR_CODES
    private enhanceError(err: Error, jobIndex: number): MediaXError {
        if (err instanceof MediaXError) {
            return err;
        }

        const message = err.message.toLowerCase();
        
        if (message.includes('no such file') || message.includes('not found')) {
            return new MediaXError(
                'Input file not found - check file path', 
                ERROR_CODES.FILE_NOT_FOUND
            );
        }
        
        if (message.includes('permission denied')) {
            return new MediaXError(
                'Permission denied - check file permissions', 
                ERROR_CODES.PERMISSION_DENIED
            );
        }
        
        return new MediaXError(
            `Pipeline error: ${err.message}`, 
            ERROR_CODES.PIPELINE_ERROR
        );
    }

    private enhanceJobError(err: Error, jobType: JobType, jobIndex: number): MediaXError {
        if (err instanceof MediaXError) {
            return err;
        }

        const message = err.message.toLowerCase();
        
        if (message.includes('does not contain any stream')) {
            return new MediaXError(
                `No compatible streams found for ${jobType} operation`, 
                ERROR_CODES.NO_STREAMS,
                jobType
            );
        }
        
        if (message.includes('invalid data')) {
            return new MediaXError(
                'Corrupted or invalid media file', 
                ERROR_CODES.INVALID_MEDIA,
                jobType
            );
        }
        
        if (message.includes('conversion failed')) {
            return new MediaXError(
                `${jobType} operation failed - check codec compatibility`, 
                ERROR_CODES.CONVERSION_FAILED,
                jobType
            );
        }

        if (message.includes('ffmpeg exited with code')) {
            return new MediaXFFmpegError(
                `${jobType} operation failed`,
                this.extractExitCode(message),
                message,
                jobType
            );
        }

        return new MediaXError(
            `Job ${jobIndex} (${jobType}) failed: ${err.message}`, 
            ERROR_CODES.JOB_FAILED,
            jobType
        );
    }

    private extractExitCode(message: string): number | undefined {
        const match = message.match(/exited with code (\d+)/);
        return match ? parseInt(match[1], 10) : undefined;
    }

    // Optimized output generation with better naming
    private generateDefaultOutput(type: JobType, index: number): string {
        const timestamp = Date.now();
        const outputMap: Record<JobType, string> = {
            convert: `output_${index}_${timestamp}.mp4`,
            compress: `compressed_${index}_${timestamp}.mp4`,
            replaceAudio: `replaced_${index}_${timestamp}.mp4`,
            toGif: `animation_${index}_${timestamp}.gif`,
            clip: `clip_${index}_${timestamp}.mp4`,
            concat: `concatenated_${index}_${timestamp}.mp4`,
            watermark: `watermarked_${index}_${timestamp}.mp4`,
            extractAudio: `audio_${index}_${timestamp}.aac`,
            thumbnail: `thumb_${index}_${timestamp}.png`,
            frames: `frame_%04d_${index}_${timestamp}.png`,
            metadata: `metadata_${index}_${timestamp}.json`
        };

        return outputMap[type] || `output_${index}_${timestamp}`;
    }

    private cleanup(): void {
        this.jobs.forEach(job => {
            if (job && typeof job.removeAllListeners === 'function') {
                job.removeAllListeners();
            }
        });
    }
}

// Helper function
function parseTimeToSeconds(time: string): number {
    if (!time || typeof time !== 'string') return 0;
    
    try {
        const parts = time.split(':');
        if (parts.length === 3) {
            const [h, m, s] = parts.map(Number);
            return h * 3600 + m * 60 + s;
        }
        return parseFloat(time) || 0;
    } catch {
        return 0;
    }
}
