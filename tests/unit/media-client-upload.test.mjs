import test from "node:test";
import assert from "node:assert/strict";
import { createMediaUploadBatches, validateMediaFiles, parseMediaUploadResponse, uploadMediaFilesInBatches, MAX_MEDIA_REQUEST_BYTES } from "../../lib/media/client-upload.mjs";

const files = (count) => Array.from({ length: count }, (_, i) => ({ name: `${i}.jpg`, size: 2 * 1024 * 1024, type: "image/jpeg" }));
for (const count of [1, 8, 10]) {
  test(`${count} media files preserve order and fit the request budget`, () => {
    const input = files(count);
    assert.equal(validateMediaFiles(input), null);
    const batches = createMediaUploadBatches(input);
    assert.deepEqual(batches.flat(), input);
    assert.ok(batches.every((batch) => batch.reduce((sum, file) => sum + file.size, 0) <= MAX_MEDIA_REQUEST_BYTES));
  });
}
test("media selection rejects oversized/count/type and accepts ICO", () => {
  assert.match(validateMediaFiles([{ ...files(1)[0], size: 5 * 1024 * 1024 + 1 }]), /5MB/);
  assert.match(validateMediaFiles(files(11)), /10/);
  assert.match(validateMediaFiles([{ ...files(1)[0], type: "text/plain" }]), /格式/);
  assert.equal(validateMediaFiles([{ ...files(1)[0], type: "image/vnd.microsoft.icon" }]), null);
});
for (const status of [413, 429, 500]) {
  test(`non-JSON HTTP ${status} has a safe reason`, async () => {
    const result = await parseMediaUploadResponse(new Response("<html>proxy error</html>", { status }));
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.ok(result.error.length > 0);
    assert.doesNotMatch(result.error, /html/);
  });
}
test("JSON errors handle bucket missing and do not expose credentials", async () => {
  const parse = (error) => parseMediaUploadResponse(new Response(JSON.stringify({ error }), { status: 400 }));
  assert.match((await parse("Bucket not found")).error, /Bucket 不存在/);
  assert.doesNotMatch((await parse("secret=private-value")).error, /private-value/);
  assert.match((await parse({ message: "图片格式不支持" })).error, /图片格式/);
});
test("partial failures never erase earlier successes and continue in order", async () => {
  const visited = [];
  const result = await uploadMediaFilesInBatches(files(3), async (file) => {
    visited.push(file.name);
    return file.name === "1.jpg" ? { ok: false, status: 413, error: "请求内容过大" } : { ok: true };
  });
  assert.deepEqual(visited, ["0.jpg", "1.jpg", "2.jpg"]);
  assert.deepEqual(result.successes, ["0.jpg", "2.jpg"]);
  assert.deepEqual(result.failures, [{ fileName: "1.jpg", status: 413, error: "请求内容过大" }]);
});
