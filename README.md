# Download video Sora 2 without watermark (Chrome Extension)

A lightweight Chrome/Edge/Brave extension to fetch and download Sora 2 videos without watermark. Supports two resolvers with automatic fallback.

- Option 1: SaveSora API resolver (primary)
- Option 2: Direct link resolver (videos.openai.com / videosN.ss2.life) with quality ranking by Content-Length

Note: Video must be public to download.

## Features
- One‑click download from the popup or per‑video floating button on pages with <video>.
- Method selector: Auto, Option 1, Option 2 (persists across sessions).
- Auto‑fallback: if the preferred method fails, the other method is tried automatically.
- Smart filename pattern with prompt/id/date/time and extension auto‑append (.mp4).
- Saves directly to your default Downloads (no extra subfolders).

## Install (Chrome/Edge/Brave)
1. Download or clone this repository and extract the ZIP.
2. Open `chrome://extensions` and enable Developer mode.
3. Click “Load unpacked” and select the extracted folder.

## Usage
- Open the popup → paste the Sora share link (or use “Use tab URL”) → click the download icon.
- Or right‑click on a page/link → “Download Sora video”.
- On pages with `<video>`, a small floating teal button is injected for quick downloading.

## Permissions
- `downloads`, `contextMenus`, `activeTab`, `tabs`, `scripting`, `storage`
- Host permissions: `https://savesora.com/*`

## How it works (high level)
- Option 1 calls SaveSora endpoints and extracts proxy download links, then probes mirrors.
- Option 2 scans the active tab for direct candidates (OpenAI/ss2 mirrors), ranks by Content‑Length, and picks the largest (highest quality) URL.

## Notes & Copyright
- Please respect platform terms and intellectual property. Only download when you have the legal right.
- ©2025 – Developed by DIEP VAN TIEN – Version mirrors the extension manifest.
