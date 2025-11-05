
# Sora 2 Downloader (Chrome Extension)

Download Sora 2 videos **không logo** (no watermark) bằng SaveSora API.

## Cách cài đặt (Chrome/Edge/Brave)
1. Tải file ZIP và giải nén.
2. Mở `chrome://extensions` → Bật **Developer mode** (Góc phải).
3. Chọn **Load unpacked** → Trỏ tới thư mục đã giải nén.

## Cách dùng
- Bấm icon extension → dán **link chia sẻ Sora** hoặc **URL tab hiện tại** → **Lấy link / Tải**.
- Hoặc click chuột phải chọn **Download Sora video via SaveSora** trên trang/link.
- Trên các trang có thẻ `<video>`, extension sẽ chèn nút **Download (SaveSora)** nổi.

## Kỹ thuật
- Gọi `https://savesora.com/api/download-video-new` và tự bắt nhiều định dạng payload: `{url}`, `{link}`, `{videoUrl}`. Nếu thất bại sẽ fallback sang `GET ?url=`.
- Tự động trích link `https://savesora.com/api/proxy-download?url=...` và tải bằng `chrome.downloads.download`.
- Quyền truy cập: `downloads`, `contextMenus`, `activeTab`, và `host_permissions` cho `https://savesora.com/*`.

> Lưu ý: Tôn trọng bản quyền và điều khoản nền tảng. Chỉ tải video khi bạn có quyền hợp pháp.
