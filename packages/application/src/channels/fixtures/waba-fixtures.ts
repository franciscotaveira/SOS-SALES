/**
 * Meta WABA Webhook Fixtures
 * Authentic payloads compliant with WhatsApp Business Platform Cloud API specifications.
 */

export const WABA_INBOUND_TEXT_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: {
                  name: "Maria Silva",
                },
                wa_id: "5511988887777",
              },
            ],
            messages: [
              {
                from: "5511988887777",
                id: "wamid.HBgLNTUxMTk4ODg4Nzc3NxUCABEYEjE2Q0RCM0Y0RDI4MzlCNjAwMAA=",
                timestamp: "1726700000",
                text: {
                  body: "Olá, gostaria de saber mais sobre o atendimento.",
                },
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

export const WABA_INBOUND_IMAGE_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: {
                  name: "Carlos Eduardo",
                },
                wa_id: "5511977776666",
              },
            ],
            messages: [
              {
                from: "5511977776666",
                id: "wamid.HBgLNTUxMTk3Nzc3NjY2NxUCABEYEjQ3RDBDMkU0RDI4MzlCNjExMQA=",
                timestamp: "1726700100",
                type: "image",
                image: {
                  mime_type: "image/jpeg",
                  sha256: "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b",
                  id: "109283746501928",
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_STATUS_DELIVERED_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            statuses: [
              {
                id: "wamid.HBgLNTUxMTk4ODg4Nzc3NxUCABEYEjE2Q0RCM0Y0RDI4MzlCNjAwMAA=",
                status: "delivered",
                timestamp: "1726700010",
                recipient_id: "5511988887777",
                conversation: {
                  id: "conv_meta_987654321",
                  origin: {
                    type: "user_initiated",
                  },
                },
                pricing: {
                  billable: true,
                  pricing_model: "CBP",
                  category: "service",
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_STATUS_READ_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            statuses: [
              {
                id: "wamid.HBgLNTUxMTk4ODg4Nzc3NxUCABEYEjE2Q0RCM0Y0RDI4MzlCNjAwMAA=",
                status: "read",
                timestamp: "1726700025",
                recipient_id: "5511988887777",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_STATUS_FAILED_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            statuses: [
              {
                id: "wamid.HBgLNTUxMTk4ODg4Nzc3NxUCABEYEjE2Q0RCM0Y0RDI4MzlCNjAwMAA=",
                status: "failed",
                timestamp: "1726700030",
                recipient_id: "5511988887777",
                errors: [
                  {
                    code: 131026,
                    title: "Message undeliverable",
                    message: "Recipient is not a valid WhatsApp user",
                    error_data: {
                      details: "User does not have WhatsApp installed",
                    },
                  },
                ],
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_BATCH_MULTIPLE_ENTRIES_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry_account_01",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "phone_id_01",
            },
            messages: [
              {
                from: "5511988881111",
                id: "wamid.msg_01",
                timestamp: "1726700100",
                text: { body: "Primeira mensagem" },
                type: "text",
              },
              {
                from: "5511988882222",
                id: "wamid.msg_02",
                timestamp: "1726700105",
                type: "image",
                image: { id: "img_02", caption: "Segunda mensagem com foto" },
              },
            ],
            statuses: [
              {
                id: "wamid.status_01",
                status: "delivered",
                timestamp: "1726700110",
                recipient_id: "5511988883333",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
    {
      id: "entry_account_02",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "phone_id_01",
            },
            messages: [
              {
                from: "5511988884444",
                id: "wamid.msg_03",
                timestamp: "1726700120",
                text: { body: "Terceira mensagem no entry 2" },
                type: "text",
              },
            ],
            statuses: [
              {
                id: "wamid.status_02",
                status: "read",
                timestamp: "1726700125",
                recipient_id: "5511988884444",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_INBOUND_AUDIO_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: { name: "Lucas Mendes" },
                wa_id: "5511966665555",
              },
            ],
            messages: [
              {
                from: "5511966665555",
                id: "wamid.AUDIO_MSG_123",
                timestamp: "1726700200",
                type: "audio",
                audio: {
                  mime_type: "audio/ogg; codecs=opus",
                  sha256: "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b",
                  id: "102938475600001",
                  voice: true,
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_INBOUND_VIDEO_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: { name: "Fernanda Lima" },
                wa_id: "5511955554444",
              },
            ],
            messages: [
              {
                from: "5511955554444",
                id: "wamid.VIDEO_MSG_456",
                timestamp: "1726700300",
                type: "video",
                video: {
                  caption: "Gravação da vistoria",
                  mime_type: "video/mp4",
                  sha256: "02ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546c",
                  id: "102938475600002",
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_INBOUND_DOCUMENT_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: { name: "Roberto Dias" },
                wa_id: "5511944443333",
              },
            ],
            messages: [
              {
                from: "5511944443333",
                id: "wamid.DOC_MSG_789",
                timestamp: "1726700400",
                type: "document",
                document: {
                  filename: "contrato_assinado.pdf",
                  caption: "Segue contrato assinado",
                  mime_type: "application/pdf",
                  sha256: "03ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546d",
                  id: "102938475600003",
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_INBOUND_INTERACTIVE_BUTTON_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: { name: "Mariana Souza" },
                wa_id: "5511933332222",
              },
            ],
            messages: [
              {
                from: "5511933332222",
                id: "wamid.BUTTON_REPLY_101",
                timestamp: "1726700500",
                type: "interactive",
                interactive: {
                  type: "button_reply",
                  button_reply: {
                    id: "btn_accept_proposal",
                    title: "Aceitar Proposta",
                  },
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const WABA_INBOUND_INTERACTIVE_LIST_FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "109876543210987",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+5511999998888",
              phone_number_id: "102938475610293",
            },
            contacts: [
              {
                profile: { name: "Julio Cesar" },
                wa_id: "5511922221111",
              },
            ],
            messages: [
              {
                from: "5511922221111",
                id: "wamid.LIST_REPLY_202",
                timestamp: "1726700600",
                type: "interactive",
                interactive: {
                  type: "list_reply",
                  list_reply: {
                    id: "plan_tier_pro",
                    title: "Plano Profissional",
                    description: "Acesso total aos recursos",
                  },
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};
