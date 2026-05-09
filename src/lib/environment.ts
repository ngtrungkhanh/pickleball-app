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
    error: 'Preview dang dung chung database voi production. Da chan thao tac ghi de bao ve data that.',
  };
}
