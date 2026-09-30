import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { formatTime } from "../pages/cockpit/utils/formatTime";
import { formatPhone } from "../pages/cockpit/utils/formatPhone";
import { renderWhatsappMarkdown } from "../pages/cockpit/utils/whatsappMarkdown";

describe("Cockpit Utilities Suite (MCT OS v2.0)", () => {
  describe("formatTime", () => {
    it("should format current day times in 24h format (HH:mm)", () => {
      const now = new Date();
      now.setHours(14, 35, 0, 0);
      const res = formatTime(now);
      expect(res).toBe("14:35");
    });

    it("should return 'Ontem' for yesterday's date", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 0, 0, 0);
      const res = formatTime(yesterday);
      expect(res).toBe("Ontem");
    });

    it("should return dd/MM for dates older than yesterday", () => {
      const oldDate = new Date(2026, 8, 15, 9, 30);
      const res = formatTime(oldDate);
      expect(res).toBe("15/09");
    });
  });

  describe("formatPhone", () => {
    it("should format Brazilian 9-digit mobile to +55 49 98765-4321", () => {
      expect(formatPhone("5549987654321")).toBe("+55 49 98765-4321");
      expect(formatPhone("+5549987654321")).toBe("+55 49 98765-4321");
      expect(formatPhone("49987654321")).toBe("+55 49 98765-4321");
    });

    it("should format Brazilian 8-digit landline to +55 49 3322-4321", () => {
      expect(formatPhone("554933224321")).toBe("+55 49 3322-4321");
      expect(formatPhone("4933224321")).toBe("+55 49 3322-4321");
    });

    it("should preserve foreign numbers or non-standard formats", () => {
      expect(formatPhone("+12025550123")).toBe("+12025550123");
    });
  });

  describe("renderWhatsappMarkdown", () => {
    it("should render bold without raw asterisks", () => {
      const html = renderToString(<div>{renderWhatsappMarkdown("*Negrito aqui*")}</div>);
      expect(html).toContain("<strong>Negrito aqui</strong>");
      expect(html).not.toContain("*Negrito aqui*");
    });

    it("should render italic without raw underscores", () => {
      const html = renderToString(<div>{renderWhatsappMarkdown("_Itálico aqui_")}</div>);
      expect(html).toContain("<em>Itálico aqui</em>");
      expect(html).not.toContain("_Itálico aqui_");
    });

    it("should render strikethrough without raw tildes", () => {
      const html = renderToString(<div>{renderWhatsappMarkdown("~Cancelado~")}</div>);
      expect(html).toContain("<del>Cancelado</del>");
      expect(html).not.toContain("~Cancelado~");
    });

    it("should render monospace code blocks", () => {
      const html = renderToString(<div>{renderWhatsappMarkdown("```codigo123```")}</div>);
      expect(html).toContain("<code>codigo123</code>");
    });
  });
});
