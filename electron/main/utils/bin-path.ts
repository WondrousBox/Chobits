
import os from "node:os";
import { getRealPath } from ".";

export function getFfmpegPath(binName: "ffmpeg" | "yt-dlp") {
  switch (binName) {
    case "ffmpeg":
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === "darwin" ? "ffmpeg" : "ffmpeg.exe"}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === "darwin" ? "ffmpeg" : "ffmpeg.exe"}`,
      );
    case "yt-dlp":
      return getRealPath(
        `../yt-dlp/${os.platform()}/${os.platform() === "darwin" ? "yt-dlp_macos" : "yt-dlp.exe"}`,
        `./resources/yt-dlp/${os.platform()}/${os.platform() === "darwin" ? "yt-dlp_macos" : "yt-dlp.exe"}`,
      );
    default:
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === "darwin" ? "ffmpeg" : "ffmpeg.exe"}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === "darwin" ? "ffmpeg" : "ffmpeg.exe"}`,
      );
  }
}