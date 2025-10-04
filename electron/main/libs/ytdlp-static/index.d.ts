/// <reference types="node" />
import { ChildProcess, ExecFileException } from 'child_process';
import { YTDlpEventEmitter, YTDlpOptions, YTDlpPromise, YTDlpReadable } from './types';
export declare class YTDlpWrap {
    private binaryPath;
    constructor(binaryPath?: string);
    getBinaryPath(): string;
    setBinaryPath(binaryPath: string): void;
    exec(ytDlpArguments?: string[], options?: YTDlpOptions, abortSignal?: AbortSignal | null): YTDlpEventEmitter;
    execPromise(ytDlpArguments?: string[], options?: YTDlpOptions, abortSignal?: AbortSignal | null): YTDlpPromise<string>;
    execStream(ytDlpArguments?: string[], options?: YTDlpOptions, abortSignal?: AbortSignal | null): YTDlpReadable;
    getExtractors(): Promise<string[]>;
    getExtractorDescriptions(): Promise<string[]>;
    getThumbnail(ytDlpArguments: string | string[]): Promise<string>;
    getVideoInfo(ytDlpArguments: string | string[]): Promise<any>;
    getPlaylistInfo(ytDlpArguments: string | string[]): Promise<any>;
    static bindAbortSignal(signal: AbortSignal | null, process: ChildProcess): void;
    static setDefaultOptions(options: YTDlpOptions): YTDlpOptions;
    static createError(code: number | ExecFileException | null, processError: Error | null, stderrData: string): Error;
    static emitYoutubeDlEvents(stringData: string, emitter: YTDlpEventEmitter | YTDlpReadable): void;
}
declare const ytdl: YTDlpWrap;
export default ytdl;
export declare const ytdlPath: string;
