import { ChildProcess, execFile, ExecFileException, execSync, spawn } from "child_process";
import { EventEmitter } from "events";
import os from "os";
import { Readable } from "stream";

import { Progress, YTDlpEventEmitter, YTDlpOptions, YTDlpPromise, YTDlpReadable } from "./types";

const executableName = "yt-dlp";
const progressRegex = /\[download\] *(.*) of ([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/;

export class YTDlpWrap {
    private binaryPath: string;

    constructor(binaryPath: string = executableName) {
        this.binaryPath = binaryPath;
    }

    getBinaryPath(): string {
        return this.binaryPath;
    }

    setBinaryPath(binaryPath: string) {
        this.binaryPath = binaryPath;
    }

    exec(ytDlpArguments: string[] = [], options: YTDlpOptions = {}, abortSignal: AbortSignal | null = null): YTDlpEventEmitter {
        options = YTDlpWrap.setDefaultOptions(options);
        const execEventEmitter = new EventEmitter() as YTDlpEventEmitter;
        const ytDlpProcess = spawn(this.binaryPath, ytDlpArguments, options);
        execEventEmitter.ytDlpProcess = ytDlpProcess;
        YTDlpWrap.bindAbortSignal(abortSignal, ytDlpProcess, execEventEmitter);

        let stderrData = "";
        let processError: Error;
        ytDlpProcess.stdout.on("data", (data) => YTDlpWrap.emitYoutubeDlEvents(data.toString(), execEventEmitter));
        ytDlpProcess.stderr.on("data", (data) => (stderrData += data.toString()));
        ytDlpProcess.on("error", (error) => (processError = error));

        ytDlpProcess.on("close", (code) => {
            if (code === 0 || ytDlpProcess.killed) { execEventEmitter.emit("close", code); }
            else { execEventEmitter.emit("error", YTDlpWrap.createError(code, processError, stderrData)); }
        });

        return execEventEmitter;
    }

    execPromise(ytDlpArguments: string[] = [], options: YTDlpOptions = {}, abortSignal: AbortSignal | null = null): YTDlpPromise<string> {
        let ytDlpProcess: ChildProcess | undefined;
        console.log(ytDlpArguments);
        const ytDlpPromise: YTDlpPromise<string> = new Promise((resolve, reject) => {
            options = YTDlpWrap.setDefaultOptions(options);
            ytDlpProcess = execFile(this.binaryPath, ytDlpArguments, options, (error, stdout, stderr) => {
                if (error) { reject(YTDlpWrap.createError(error, null, stderr)); }
                resolve(stdout);
            });
            YTDlpWrap.bindAbortSignal(abortSignal, ytDlpProcess);
        });

        ytDlpPromise.ytDlpProcess = ytDlpProcess;

        return ytDlpPromise;
    }

    execStream(ytDlpArguments: string[] = [], options: YTDlpOptions = {}, abortSignal: AbortSignal | null = null): YTDlpReadable {
        const readStream: YTDlpReadable = new Readable({ read(size) { } });

        options = YTDlpWrap.setDefaultOptions(options);
        ytDlpArguments = ytDlpArguments.concat(["-o", "-"]);
        const ytDlpProcess = spawn(this.binaryPath, ytDlpArguments, options);
        readStream.ytDlpProcess = ytDlpProcess;
        YTDlpWrap.bindAbortSignal(abortSignal, ytDlpProcess);

        let stderrData = "";
        let processError: Error;
        ytDlpProcess.stdout.on("data", (data) => readStream.push(data));
        ytDlpProcess.stderr.on("data", (data) => {
            const stringData = data.toString();
            YTDlpWrap.emitYoutubeDlEvents(stringData, readStream);
            stderrData += stringData;
        });
        ytDlpProcess.on("error", (error) => (processError = error));

        ytDlpProcess.on("close", (code) => {
            if (code === 0 || ytDlpProcess.killed) {
                readStream.emit("close");
                readStream.destroy();
                readStream.emit("end");
            } else {
                const error = YTDlpWrap.createError(code, processError, stderrData);
                readStream.emit("error", error);
                readStream.destroy(error);
            }
        });

        return readStream;
    }

    async getExtractors(): Promise<string[]> {
        // --list-extractors: List all supported extractors and exit
        const ytDlpStdout = await this.execPromise(["--list-extractors"]);

        return ytDlpStdout.split("\n");
    }

    async getExtractorDescriptions(): Promise<string[]> {
        // --extractor-descriptions: Output descriptions of all supported extractors and exit
        const ytDlpStdout = await this.execPromise(["--extractor-descriptions"]);

        return ytDlpStdout.split("\n");
    }

    async getThumbnail(ytDlpArguments: string | string[]): Promise<string> {
        if (typeof ytDlpArguments == "string") { ytDlpArguments = [ytDlpArguments]; }
        const ytDlpStdout = await this.execPromise(ytDlpArguments.concat(["--get-thumbnail"]));

        return ytDlpStdout.replace(/\n/, "");
    }

    // 已经被重构
    async getVideoInfo(ytDlpArguments: string | string[], abortSignal: AbortSignal | null = null): Promise<any> {
        if (typeof ytDlpArguments == "string") { ytDlpArguments = [ytDlpArguments]; }
        // if (!ytDlpArguments.includes('-f') && !ytDlpArguments.includes('--format')) { ytDlpArguments = ytDlpArguments.concat(['-f', 'best']); }
        // -j, --dump-json: Quiet, but print JSON information for each video.
        let ytDlpStdout;
        try {
            ytDlpStdout = await this.execPromise(ytDlpArguments.concat(["--dump-json", "--no-playlist"]), undefined, abortSignal);

            return JSON.parse(ytDlpStdout);
        } catch (e) {
            return e;
        }
    }

    // 新增的方法，获取播放列表信息
    async getPlaylistInfo(ytDlpArguments: string | string[], abortSignal: AbortSignal | null = null): Promise<any> {
        if (typeof ytDlpArguments == "string") { ytDlpArguments = [ytDlpArguments]; }
        // -J, --dump-single-json: Quiet, but print JSON information for each URL or infojson passed. 
        let ytDlpStdout;
        try {
            // ytDlpStdout = await this.execPromise(ytDlpArguments.concat(["-J", "--flat-playlist"]), undefined, abortSignal);
            ytDlpStdout = await this.execPromise(ytDlpArguments.concat(["-J", "--yes-playlist"]), undefined, abortSignal);

            return JSON.parse(ytDlpStdout);
        } catch (e) {
            return e;
        }
    }

    // 已经被重构
    static bindAbortSignal(signal: AbortSignal | null, process: ChildProcess, emitter?: YTDlpEventEmitter): void {
        signal?.addEventListener("abort", () => {
            try {
                if (os.platform() === "win32") { execSync(`taskkill /pid ${process.pid} /T /F`); }
                else {
                    execSync(`pgrep -P ${process.pid} | xargs -L 1 kill`);
                }
            } catch (e) {
                console.error(e);
            } finally {
                process.kill();
            }
            emitter?.emit("abort", process.pid || null);
        });
    }

    static setDefaultOptions(options: YTDlpOptions): YTDlpOptions {
        if (!options.maxBuffer) { options.maxBuffer = 1024 * 1024 * 1024; }

        return options;
    }

    // 已经被重构
    static createError(code: number | ExecFileException | null, processError: Error | null, stderrData: string): Error {
        // 旧版本拼接错误的方式
        // let errorMessage = '\nError code: ' + code;
        // if (processError) { errorMessage += '\n\nProcess error:\n' + processError; }
        // if (stderrData) { errorMessage += '\n\nStderr:\n' + stderrData; }

        // return new Error(errorMessage);

        // 重构之后的版本, 优先返回原始错误，其次是 stderrDataError, 最后是 codeMessage
        // if (code instanceof Error) {
        //     return code;
        // } else {
        const codeMessage = "\nError code: " + code;
        const processErrorMessage = processError ? "\n\nProcess error:\n" + processError : "";
        const stderrDataError = stderrData ? "\n\nStderr:\n" + stderrData : "";
        if (stderrDataError) {
            return new Error(stderrDataError);
        } else {
            return new Error(codeMessage + processErrorMessage + stderrDataError);
        }
        // }
    }

    static emitYoutubeDlEvents(stringData: string, emitter: YTDlpEventEmitter | YTDlpReadable): void {
        const outputLines = stringData.split(/\r|\n/g).filter(Boolean);
        for (const outputLine of outputLines) {
            if (outputLine[0] === "[") {
                const progressMatch = outputLine.match(progressRegex);
                if (progressMatch) {
                    const progressObject: Progress = {};
                    progressObject.percent = parseFloat(progressMatch[1].replace("%", ""));
                    progressObject.totalSize = progressMatch[2].replace("~", "");
                    progressObject.currentSpeed = progressMatch[4];
                    progressObject.eta = progressMatch[6];

                    (emitter as YTDlpEventEmitter).emit("progress", progressObject);
                }

                const eventType = outputLine.split(" ")[0].replace("[", "").replace("]", "");
                const eventData = outputLine.substring(outputLine.indexOf(" "), outputLine.length);
                (emitter as YTDlpEventEmitter).emit("ytDlpEvent", eventType, eventData);
            }
            // else {
            //     (emitter as YTDlpEventEmitter).emit('ytDlpEvent', 'unknown', outputLine);
            // }
        }
    }
}

export default new YTDlpWrap();
