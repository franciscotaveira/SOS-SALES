/**
 * WAHA Webhook Fixtures
 * Authentic payloads compliant with WhatsApp HTTP API (WAHA) event specifications.
 */

export const WAHA_INBOUND_TEXT_FIXTURE = {
  event: "message",
  session: "default",
  payload: {
    id: "false_5511988887777@c.us_3EB0C2719B53",
    timestamp: 1726700000,
    from: "5511988887777@c.us",
    fromMe: false,
    to: "5511999998888@c.us",
    body: "Olá, gostaria de saber mais sobre o plano comercial.",
    hasMedia: false,
    ack: 1,
    _data: {
      notifyName: "Roberto Lima",
    },
  },
};

export const WAHA_INBOUND_IMAGE_FIXTURE = {
  event: "message",
  session: "default",
  payload: {
    id: "false_5511977776666@c.us_3EB0D4828C64",
    timestamp: 1726700100,
    from: "5511977776666@c.us",
    fromMe: false,
    to: "5511999998888@c.us",
    body: "Segue o comprovante",
    hasMedia: true,
    mediaUrl: "https://storage.waha.internal/media/3EB0D4828C64.jpg",
    ack: 1,
  },
};

export const WAHA_ACK_DELIVERED_FIXTURE = {
  event: "message.ack",
  session: "default",
  payload: {
    id: "true_5511988887777@c.us_3EB0A1234F56",
    to: "5511988887777@c.us",
    from: "5511999998888@c.us",
    ack: 2, // 1: server ack (sent), 2: delivery ack (delivered), 3: read ack (read)
    ackName: "DEVICE",
    timestamp: 1726700015,
  },
};

export const WAHA_ACK_READ_FIXTURE = {
  event: "message.ack",
  session: "default",
  payload: {
    id: "true_5511988887777@c.us_3EB0A1234F56",
    to: "5511988887777@c.us",
    from: "5511999998888@c.us",
    ack: 3,
    ackName: "READ",
    timestamp: 1726700030,
  },
};

export const WAHA_ACK_FAILED_FIXTURE = {
  event: "message.ack",
  session: "default",
  payload: {
    id: "true_5511988887777@c.us_3EB0A1234F56",
    to: "5511988887777@c.us",
    from: "5511999998888@c.us",
    ack: -1, // negative ack represents failure
    ackName: "FAILED",
    timestamp: 1726700045,
  },
};

export const WAHA_INBOUND_AUDIO_FIXTURE = {
  event: "message",
  session: "default",
  payload: {
    id: "false_5511977776666@c.us_3EB0D4828C65",
    timestamp: 1726700110,
    from: "5511977776666@c.us",
    fromMe: false,
    to: "5511999998888@c.us",
    hasMedia: true,
    mediaUrl: "https://storage.waha.internal/media/voice-note-123.ogg",
    ack: 1,
  },
};

export const WAHA_INBOUND_VIDEO_FIXTURE = {
  event: "message",
  session: "default",
  payload: {
    id: "false_5511977776666@c.us_3EB0D4828C66",
    timestamp: 1726700120,
    from: "5511977776666@c.us",
    fromMe: false,
    to: "5511999998888@c.us",
    body: "Demonstração do produto",
    hasMedia: true,
    mediaUrl: "https://storage.waha.internal/media/demo-video-456.mp4",
    ack: 1,
  },
};

export const WAHA_INBOUND_DOCUMENT_FIXTURE = {
  event: "message",
  session: "default",
  payload: {
    id: "false_5511977776666@c.us_3EB0D4828C67",
    timestamp: 1726700130,
    from: "5511977776666@c.us",
    fromMe: false,
    to: "5511999998888@c.us",
    body: "Contrato assinado em anexo",
    hasMedia: true,
    mediaUrl: "https://storage.waha.internal/media/contrato-final.pdf",
    ack: 1,
  },
};

export const WAHA_SESSION_STATUS_WORKING_FIXTURE = {
  event: "session.status",
  session: "default",
  payload: {
    name: "default",
    status: "WORKING",
    timestamp: 1726700200,
  },
};

export const WAHA_SESSION_STATUS_SCAN_QR_FIXTURE = {
  event: "session.status",
  session: "default",
  payload: {
    name: "default",
    status: "SCAN_QR_CODE",
    timestamp: 1726700210,
  },
};

export const WAHA_SESSION_STATUS_STOPPED_FIXTURE = {
  event: "session.status",
  session: "default",
  payload: {
    name: "default",
    status: "STOPPED",
    timestamp: 1726700220,
  },
};

export const WAHA_SESSION_QR_FIXTURE = {
  event: "session.qr",
  session: "default",
  payload: {
    name: "default",
    qr: "2@ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX234YZ==,TEST_WAHA_QR_RAW",
    timestamp: 1726700230,
  },
};

export const WAHA_SESSION_AUTH_FAILURE_FIXTURE = {
  event: "session.auth_failure",
  session: "default",
  payload: {
    name: "default",
    reason: "DEVICE_LOGOUT_BY_USER",
    timestamp: 1726700240,
  },
};

