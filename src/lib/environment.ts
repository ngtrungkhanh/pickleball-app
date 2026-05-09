export function isPreviewEnvironment() {
  return process.env.VERCEL_ENV === 'preview';
}

export function previewWritesAllowed() {
  return process.env.ALLOW_PREVIEW_WRITES === 'true';
}

export function shouldBlockPreviewWrites() {
  return isPreviewEnvironment() && !previewWritesAllowed();
}

export function previewWriteBlockedResult() {
  return {
    error: 'Preview đang dùng chung database với production. Đã chặn thao tác ghi để bảo vệ data thật.',
  };
}
