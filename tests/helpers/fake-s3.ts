import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Tiny in-process S3 look-alike (path-style: /bucket/key) for driver contract
 * tests: PUT, GET with Range, HEAD, DELETE. It does NOT verify signatures. It
 * exists because Docker/MinIO is unavailable; real endpoints are covered by the
 * same contract suite when S3_TEST_ENDPOINT is set.
 */
export type FakeS3 = { endpoint: string; bucket: string; requests: string[]; close: () => Promise<void> };

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);
  const encoding = String(req.headers["content-encoding"] ?? "");
  const sha = String(req.headers["x-amz-content-sha256"] ?? "");
  if (!encoding.includes("aws-chunked") && !sha.startsWith("STREAMING-")) return raw;
  // Decode aws-chunked framing: "<hex-size>[;chunk-signature=...]\r\n<data>\r\n"
  const out: Buffer[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const lineEnd = raw.indexOf("\r\n", offset);
    if (lineEnd < 0) break;
    const size = parseInt(raw.subarray(offset, lineEnd).toString("latin1").split(";")[0] ?? "0", 16);
    if (!Number.isFinite(size) || size === 0) break;
    out.push(raw.subarray(lineEnd + 2, lineEnd + 2 + size));
    offset = lineEnd + 2 + size + 2;
  }
  return Buffer.concat(out);
}

export async function startFakeS3(bucket = "test-bucket"): Promise<FakeS3> {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const requests: string[] = [];

  const notFound = (res: ServerResponse, head: boolean): void => {
    res.writeHead(404, { "content-type": "application/xml" });
    res.end(head ? undefined : "<?xml version=\"1.0\"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>");
  };

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      requests.push(`${req.method} ${url.pathname}`);
      const prefix = `/${bucket}/`;
      if (!url.pathname.startsWith(prefix)) return notFound(res, req.method === "HEAD");
      const key = decodeURIComponent(url.pathname.slice(prefix.length));
      const method = req.method ?? "GET";

      if (method === "PUT") {
        const body = await readBody(req);
        objects.set(key, { body, contentType: String(req.headers["content-type"] ?? "binary/octet-stream") });
        res.writeHead(200, { etag: '"fake"' });
        return void res.end();
      }
      if (method === "DELETE") {
        objects.delete(key);
        res.writeHead(204);
        return void res.end();
      }
      const obj = objects.get(key);
      if (obj === undefined) return notFound(res, method === "HEAD");
      const baseHeaders = { "content-type": obj.contentType, "accept-ranges": "bytes", etag: '"fake"' };
      if (method === "HEAD") {
        res.writeHead(200, { ...baseHeaders, "content-length": obj.body.length });
        return void res.end();
      }
      const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ""));
      if (range === null) {
        res.writeHead(200, { ...baseHeaders, "content-length": obj.body.length });
        return void res.end(obj.body);
      }
      const start = Number(range[1]);
      const end = Math.min(range[2] === "" ? obj.body.length - 1 : Number(range[2]), obj.body.length - 1);
      if (start >= obj.body.length) {
        res.writeHead(416, { "content-range": `bytes */${obj.body.length}` });
        return void res.end();
      }
      const slice = obj.body.subarray(start, end + 1);
      res.writeHead(206, { ...baseHeaders, "content-length": slice.length, "content-range": `bytes ${start}-${end}/${obj.body.length}` });
      return void res.end(slice);
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
