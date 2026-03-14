import { exec, execFile } from "node:child_process";

export function openInBrowser(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.hostname === "[::]" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "127.0.0.1"
  ) {
    parsed.hostname = "localhost";
  }
  url = parsed.href;
  if (process.platform === "win32") {
    // `start` is a cmd.exe builtin, needs shell - quote the URL
    exec(`start "" ${JSON.stringify(url)}`, () => {});
  } else {
    // execFile bypasses the shell, so URLs with & ; etc. are safe
    const bin = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(bin, [url], () => {});
  }
}
