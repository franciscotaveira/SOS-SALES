import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";

const PORT = parseInt(process.env.PORT || process.env.PORT_SYNTHETIC_PROVIDER || "4000", 10);
const requestsLog = [];

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hub-Signature-256",
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hub-Signature-256",
    });
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = reqUrl.pathname;
  const body = await parseBody(req);

  // Journal request
  const record = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    method: req.method,
    pathname,
    query: Object.fromEntries(reqUrl.searchParams.entries()),
    headers: req.headers,
    body,
    receivedAt: new Date().toISOString(),
  };
  requestsLog.push(record);
  if (requestsLog.length > 500) requestsLog.shift();

  // 1. Health check
  if (pathname === "/health" && req.method === "GET") {
    return jsonResponse(res, 200, {
      status: "ok",
      service: "sos-v3-synthetic-provider",
      uptimeSeconds: process.uptime(),
      recordedRequestsCount: requestsLog.length,
    });
  }

  // 2. Inspection: Get requests
  if (pathname === "/requests" && req.method === "GET") {
    return jsonResponse(res, 200, {
      count: requestsLog.length,
      requests: requestsLog,
    });
  }

  // 3. Inspection: Clear requests
  if (pathname === "/requests" && req.method === "DELETE") {
    requestsLog.length = 0;
    return jsonResponse(res, 200, { cleared: true });
  }

  // 4. Meta Graph API: Phone number session verification (GET /v21.0/:phoneId)
  // Example: GET /v21.0/synthetic_lab_phone_id_992145
  const phoneGetMatch = pathname.match(/^\/v21\.0\/([a-zA-Z0-9_-]+)$/);
  if (phoneGetMatch && req.method === "GET") {
    const phoneNumberId = phoneGetMatch[1];
    return jsonResponse(res, 200, {
      id: phoneNumberId,
      display_phone_number: "+5511999998888",
      name_status: "APPROVED",
      quality_rating: "GREEN",
      verified_name: "Haven Escovaria & Esmalteria",
      code_verification_status: "VERIFIED",
    });
  }

  // 5. Meta Graph API: Outbound WhatsApp message (POST /v21.0/:phoneNumberId/messages)
  const wabaMessagesMatch = pathname.match(/^\/v21\.0\/([a-zA-Z0-9_-]+)\/messages$/);
  if (wabaMessagesMatch && req.method === "POST") {
    const phoneNumberId = wabaMessagesMatch[1];
    const to = body?.to || "+5511999991111";
    const synthMessageId = `wamid.synth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return jsonResponse(res, 200, {
      messaging_product: "whatsapp",
      contacts: [
        {
          input: to,
          wa_id: String(to).replace(/^\+/, ""),
        },
      ],
      messages: [
        {
          id: synthMessageId,
          message_status: "accepted",
        },
      ],
    });
  }

  // 6. Meta Conversions API (CAPI): Event dispatch (POST /v21.0/:datasetId/events)
  const capiMatch = pathname.match(/^\/v21\.0\/([0-9a-zA-Z_-]+)\/events$/);
  if (capiMatch && req.method === "POST") {
    const datasetId = capiMatch[1];
    const dataCount = Array.isArray(body?.data) ? body.data.length : 1;
    const fbtraceId = `synth_trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return jsonResponse(res, 200, {
      events_received: dataCount,
      messages: [],
      fbtrace_id: fbtraceId,
    });
  }

  // 7. WAHA Compatibility endpoints
  if (pathname === "/api/server/version" && req.method === "GET") {
    return jsonResponse(res, 200, { version: "2026.8.2", engine: "SYNTHETIC" });
  }

  if (pathname === "/api/sessions" && req.method === "GET") {
    return jsonResponse(res, 200, [
      { name: "default", status: "WORKING", me: { id: "5511999998888@c.us" } },
    ]);
  }

  if (pathname === "/api/sendText" && req.method === "POST") {
    const synthWahaId = `waha_synth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return jsonResponse(res, 201, {
      id: synthWahaId,
      timestamp: Date.now(),
      status: "sent",
    });
  }

  // 8. Ingress Simulation Helper: Dispatches an inbound WhatsApp message webhook to API
  if (pathname === "/simulate-inbound" && req.method === "POST") {
    try {
      const {
        apiUrl = "http://api:4400",
        endpointToken,
        appSecret = "synthetic_lab_app_secret",
        wabaId = "synthetic_lab_waba_id_81829182",
        phoneNumberId = "synthetic_lab_phone_id_992145",
        from = "+5511999991111",
        text = "Olá, gostaria de saber preços de escova",
        name = "Cliente Sintético P1",
      } = body || {};

      if (!endpointToken) {
        return jsonResponse(res, 400, { error: "endpointToken is required" });
      }

      const cleanFrom = String(from).replace(/^\+/, "");
      const synthInboundId = `wamid.inbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: wabaId,
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+5511999998888",
                    phone_number_id: phoneNumberId,
                  },
                  contacts: [
                    {
                      profile: { name },
                      wa_id: cleanFrom,
                    },
                  ],
                  messages: [
                    {
                      from: cleanFrom,
                      id: synthInboundId,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      text: { body: text },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const payloadString = JSON.stringify(webhookPayload);
      const signature = crypto.createHmac("sha256", appSecret).update(payloadString).digest("hex");

      const targetUrl = `${apiUrl}/v1/webhooks/whatsapp/${endpointToken}`;
      const apiRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": `sha256=${signature}`,
        },
        body: payloadString,
      });

      const responseText = await apiRes.text().catch(() => "");
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        parsedResponse = responseText;
      }

      return jsonResponse(res, apiRes.status, {
        dispatched: apiRes.ok,
        status: apiRes.status,
        inboundMessageId: synthInboundId,
        apiResponse: parsedResponse,
      });
    } catch (err) {
      return jsonResponse(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback 404
  return jsonResponse(res, 404, {
    error: "NOT_FOUND",
    detail: `Synthetic provider has no handler for ${req.method} ${pathname}`,
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[synthetic-provider] Listening on http://0.0.0.0:${PORT}`);
});
