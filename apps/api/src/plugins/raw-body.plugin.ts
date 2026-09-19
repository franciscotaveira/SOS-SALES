import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export const rawBodyPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      req.rawBody = buffer;
      if (buffer.length === 0) {
        return done(null, {});
      }
      try {
        const json = JSON.parse(buffer.toString("utf8"));
        done(null, json);
      } catch (err) {
        const parseError = err as Error & { statusCode?: number };
        parseError.statusCode = 400;
        done(parseError, undefined);
      }
    }
  );

  fastify.addContentTypeParser(
    "text/plain",
    { parseAs: "buffer" },
    (req, body, done) => {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      req.rawBody = buffer;
      done(null, buffer.toString("utf8"));
    }
  );
});
