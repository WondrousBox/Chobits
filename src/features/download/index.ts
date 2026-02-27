/**
 * Download Feature Module
 *
 * Consolidates all download-related renderer code:
 * - Components: DownloadBubble, DownloadFloating, DownloaderSettings, YoutubeCookieSettings
 * - Hooks: useDownloadTasks
 * - Lib: youtube-cookie-api
 *
 * @see ./README.md for the full spec document
 */

// ── Components ──────────────────────────────────────────────────────
export type { DownloadBubbleProps } from './components/DownloadBubble';
export { default as DownloadBubble } from './components/DownloadBubble';
export { default as DownloaderSettings } from './components/DownloaderSettings';
export { default as DownloadFloating } from './components/DownloadFloating';
export { YoutubeCookieSettings } from './components/YoutubeCookieSettings';

// ── Hooks ───────────────────────────────────────────────────────────
export type { DownloadProgress, DownloadTask, UseDownloadTasksOptions } from './hooks/useDownloadTasks';
export { useDownloadTasks } from './hooks/useDownloadTasks';

// ── Lib / Utilities ─────────────────────────────────────────────────
export type { CookieStatus } from './lib/youtube-cookie-api';
export { clearYoutubeCookies, exportCookies, getCookieStatus, openYoutubeLogin } from './lib/youtube-cookie-api';
