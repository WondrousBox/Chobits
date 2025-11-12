import { ChildProcess, ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process";
import { EventEmitter } from "events";
import { Readable } from "stream";

type YTDlpEventNameDataTypeMap = {
    abort: [number | null];
    close: [number | null];
    error: [Error];
    progress: [Progress];
    ytDlpEvent: [eventType: string, eventData: string];
};

type YTDlpEventName = keyof YTDlpEventNameDataTypeMap;

type YTDlpEventListener<EventName extends YTDlpEventName> = (...args: YTDlpEventNameDataTypeMap[EventName]) => void;

type YTDlpEventNameToEventListenerFunction<ReturnType> = <K extends YTDlpEventName>(channel: K, listener: YTDlpEventListener<K>) => ReturnType;

type YTDlpEventNameToEventDataFunction<ReturnType> = <K extends YTDlpEventName>(channel: K, ...args: YTDlpEventNameDataTypeMap[K]) => ReturnType;

export interface YTDlpEventEmitter extends EventEmitter {
    ytDlpProcess?: ChildProcessWithoutNullStreams;
    removeAllListeners(event?: YTDlpEventName | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listenerCount(eventName: YTDlpEventName): number;
    eventNames(): Array<YTDlpEventName>;
    addListener: YTDlpEventNameToEventListenerFunction<this>;
    prependListener: YTDlpEventNameToEventListenerFunction<this>;
    prependOnceListener: YTDlpEventNameToEventListenerFunction<this>;
    on: YTDlpEventNameToEventListenerFunction<this>;
    once: YTDlpEventNameToEventListenerFunction<this>;
    removeListener: YTDlpEventNameToEventListenerFunction<this>;
    off: YTDlpEventNameToEventListenerFunction<this>;
    listeners(eventName: YTDlpEventName): Function[];
    rawListeners(eventName: YTDlpEventName): Function[];
    emit: YTDlpEventNameToEventDataFunction<boolean>;
}

export interface YTDlpPromise<T> extends Promise<T> {
    ytDlpProcess?: ChildProcess;
}

type YTDlpReadableEventName = keyof YTDlpReadableEventNameDataTypeMap;

type YTDlpReadableEventListener<EventName extends YTDlpReadableEventName> = (...args: YTDlpReadableEventNameDataTypeMap[EventName]) => void;

type YTDlpReadableEventNameToEventListenerFunction<ReturnType> = <K extends YTDlpReadableEventName>(event: K, listener: YTDlpReadableEventListener<K>) => ReturnType;

type YTDlpReadableEventNameToEventDataFunction<ReturnType> = <K extends YTDlpReadableEventName>(event: K, ...args: YTDlpReadableEventNameDataTypeMap[K]) => ReturnType;

type YTDlpReadableEventNameDataTypeMap = {
    close: [];
    progress: [progress: Progress];
    ytDlpEvent: [eventType: string, eventData: string];
    data: [chunk: any];
    end: [];
    error: [error: Error];
    pause: [];
    readable: [];
    resume: [];
};

export interface YTDlpReadable extends Readable {
    ytDlpProcess?: ChildProcessWithoutNullStreams;
    addListener: YTDlpReadableEventNameToEventListenerFunction<this>;
    emit: YTDlpReadableEventNameToEventDataFunction<boolean>;
    on: YTDlpReadableEventNameToEventListenerFunction<this>;
    once: YTDlpReadableEventNameToEventListenerFunction<this>;
    prependListener: YTDlpReadableEventNameToEventListenerFunction<this>;
    prependOnceListener: YTDlpReadableEventNameToEventListenerFunction<this>;
    removeListener: YTDlpReadableEventNameToEventListenerFunction<this>;
}

export interface YTDlpOptions extends SpawnOptionsWithoutStdio {
    maxBuffer?: number;
}

export interface Progress {
    percent?: number;
    totalSize?: string;
    currentSpeed?: string;
    eta?: string;
}
