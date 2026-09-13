export const MAX_MEDIA_FILES = 10;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_REQUEST_BYTES = 7 * 1024 * 1024;

export const ALLOWED_MEDIA_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export function validateMediaFiles(files) {
  if (!files.length) return "请选择图片文件";
  if (files.length > MAX_MEDIA_FILES) {
    return `单次最多上传 ${MAX_MEDIA_FILES} 个文件，当前选择 ${files.length} 个`;
  }
  const oversized = files.find((file) => file.size > MAX_MEDIA_BYTES);
  if (oversized) return `${oversized.name} 超过 5MB`;
  const unsupported = files.find((file) => !ALLOWED_MEDIA_MIME.has(file.type));
  if (unsupported) return `${unsupported.name} 的文件格式不受支持`;
  return null;
}

// One file per request keeps each upload result attributable to that file.
// Every valid file is <= 5MB, safely below the 7MB client request budget.
export function createMediaUploadBatches(files) {
  return files.map((file) => [file]);
}

export async function parseMediaUploadResponse(response) {
  const text = await response.text().catch(() => "");
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (response.ok && Array.isArray(payload?.assets) && payload.assets.length > 0) return { ok: true, payload };
  if (response.ok) return { ok: false, status: response.status, error: "上传响应无效，请刷新资源列表确认结果" };

  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const nested = record.error && typeof record.error === "object" && !Array.isArray(record.error) ? record.error : {};
  const fallback = httpUploadError(response.status);
  const message = typeof record.error === "string"
    ? record.error
    : typeof nested.message === "string"
      ? nested.message
      : fallback;
  const requestId = typeof record.request_id === "string"
    ? record.request_id
    : typeof record.requestId === "string"
      ? record.requestId
      : typeof nested.request_id === "string"
        ? nested.request_id
        : null;
  const safeMessage = /bucket.*(?:not found|does not exist)|找不到.*bucket/i.test(message)
    ? "存储 Bucket 不存在，请联系管理员"
    : /authorization|cookie|password|token|secret|api[_-]?key|select\s|insert\s|postgres|https?:\/\//i.test(message)
      ? fallback
      : message.replace(/[\u0000-\u001f]/g, " ").slice(0, 180);
  const safeId = requestId && /^[a-zA-Z0-9-]{1,36}$/.test(requestId) ? requestId : null;
  const detail = safeId ? `${safeMessage}（错误编号：${safeId}）` : safeMessage;

  return { ok: false, status: response.status, error: detail };
}

export async function uploadMediaFilesInBatches(files, uploadFile) {
  const successes = [];
  const failures = [];
  for (const [file] of createMediaUploadBatches(files)) {
    try {
      const result = await uploadFile(file);
      if (result.ok) successes.push(file.name);
      else failures.push({ fileName: file.name, status: result.status ?? null, error: result.error || "上传失败" });
    } catch {
      failures.push({ fileName: file.name, status: null, error: "网络请求失败，请稍后重试" });
    }
  }
  return { successes, failures };
}

function httpUploadError(status) {
  if (status === 413) return "请求内容过大";
  if (status === 429) return "上传请求过于频繁，请稍后重试";
  if (status >= 500) return "上传服务暂时不可用，请稍后重试";
  return "上传失败";
}
