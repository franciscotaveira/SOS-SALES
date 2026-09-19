import fs from "node:fs";
import path from "node:path";

const COMPOSE_FILE = path.resolve(process.cwd(), "docker-compose.yml");

export interface SecurityCheckResult {
  readonly check: string;
  readonly passed: boolean;
  readonly details: string;
}

export function auditDockerComposeSecurity(filePath = COMPOSE_FILE): SecurityCheckResult[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Compose file not found at: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const results: SecurityCheckResult[] = [];

  // Extract waha service section
  const wahaMatch = raw.match(/waha:\s*\n([\s\S]*?)(?=\n\s{0,2}[a-zA-Z0-9_-]+:|$)/);
  if (!wahaMatch) {
    results.push({
      check: "waha_service_exists",
      passed: false,
      details: "Service 'waha' is not defined in docker-compose.yml",
    });
    return results;
  }

  const wahaContent = wahaMatch[1];

  // 1. Image pinning by digest
  const imageMatch = wahaContent.match(/image:\s*([^\s\n]+)/);
  const image = imageMatch ? imageMatch[1] : "";
  const hasShaDigest = /@sha256:[a-f0-9]{64}$/.test(image);
  const isPlainLatest = image === "devlikeapro/waha:latest" || image.endsWith(":latest");

  results.push({
    check: "image_digest_pinning",
    passed: hasShaDigest && !isPlainLatest,
    details: hasShaDigest
      ? `Image correctly pinned by immutable digest: ${image}`
      : `Image '${image}' lacks immutable SHA-256 digest pinning`,
  });

  // 2. Loopback port binding (127.0.0.1)
  const portsMatch = wahaContent.match(/ports:\s*\n((?:\s+-\s+[^\n]+\n)+)/);
  const portLines = portsMatch ? portsMatch[1].trim().split("\n") : [];
  const loopbackBinding =
    portLines.length > 0 &&
    portLines.every((line) => {
      return line.includes("127.0.0.1:");
    });

  results.push({
    check: "loopback_port_binding",
    passed: loopbackBinding,
    details: loopbackBinding
      ? `All exposed ports bind strictly to 127.0.0.1: ${portLines.map((l) => l.trim()).join(", ")}`
      : `Insecure port mapping detected (must bind exclusively to 127.0.0.1): ${portLines.map((l) => l.trim()).join(", ")}`,
  });

  // 3. Named volume for sessions (exclusive V3, no V2 sharing)
  const volumesMatch = wahaContent.match(/volumes:\s*\n((?:\s+-\s+[^\n]+\n)+)/);
  const volumeLines = volumesMatch ? volumesMatch[1].trim().split("\n") : [];
  const hasSessionsVolume = volumeLines.some((line) => {
    return line.includes("sos_v3_waha_sessions:/app/.sessions");
  });

  const sharesV2Volume = raw.includes("v2_") || raw.includes("sos-v2") || raw.includes("evolution_");

  results.push({
    check: "v3_isolated_named_sessions_volume",
    passed: hasSessionsVolume && !sharesV2Volume,
    details:
      hasSessionsVolume && !sharesV2Volume
        ? "Session volume 'sos_v3_waha_sessions' is exclusive to V3 and mapped to /app/.sessions"
        : `Invalid volume configuration (sharesV2: ${sharesV2Volume}, volumes: ${volumeLines.map((l) => l.trim()).join(", ")})`,
  });

  // 4. Prohibit privileged: true
  const hasPrivileged = /privileged:\s*true/i.test(wahaContent);
  results.push({
    check: "prohibit_privileged_mode",
    passed: !hasPrivileged,
    details: !hasPrivileged
      ? "privileged mode is strictly disabled"
      : "VIOLATION: 'privileged: true' detected in WAHA service",
  });

  // 5. Prohibit SYS_ADMIN capability
  const hasSysAdmin = /cap_add:[\s\S]*?SYS_ADMIN/i.test(wahaContent) || /SYS_ADMIN/.test(wahaContent);
  results.push({
    check: "prohibit_sys_admin_capability",
    passed: !hasSysAdmin,
    details: !hasSysAdmin
      ? "SYS_ADMIN capability is strictly absent"
      : "VIOLATION: 'SYS_ADMIN' capability detected in WAHA service",
  });

  // 6. Prohibit literal hardcoded secrets in environment
  const hasHardcodedSecret = /WHATSAPP_API_KEY:\s*[^\s${]/i.test(wahaContent) ||
    /WHATSAPP_API_KEY:\s*["'][^"'$]/i.test(wahaContent) ||
    /WAHA_API_KEY:-[a-zA-Z0-9_]+/i.test(wahaContent);

  results.push({
    check: "prohibit_hardcoded_secrets",
    passed: !hasHardcodedSecret,
    details: !hasHardcodedSecret
      ? "Secrets are passed exclusively via environment variable references without hardcoded values"
      : "VIOLATION: Hardcoded secret or default literal fallback detected in compose environment",
  });

  // 7. Healthcheck defined and compatible with WAHA version
  const hasHealthcheck =
    wahaContent.includes("healthcheck:") &&
    wahaContent.includes("/api/server/version");

  results.push({
    check: "healthcheck_defined_and_compatible",
    passed: hasHealthcheck,
    details: hasHealthcheck
      ? "Healthcheck probe configured against verified endpoint /api/server/version"
      : "Healthcheck probe missing or uses incompatible endpoint",
  });

  // 8. Resource limits
  const hasCpusLimit = /cpus:\s*['"]?1\.50?['"]?/.test(wahaContent);
  const hasMemoryLimit = /memory:\s*1024M/.test(wahaContent);
  const hasResourceLimits = hasCpusLimit && hasMemoryLimit;

  results.push({
    check: "resource_limits_enforced",
    passed: hasResourceLimits,
    details: hasResourceLimits
      ? "Resource limits enforced (CPU: 1.50, Memory: 1024M)"
      : "Resource limits missing or invalid",
  });

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("================================================================================");
  console.log(" SOS SALES V3 — DOCKER COMPOSE SECURITY AUDIT (CH-10)");
  console.log("================================================================================");

  const checks = auditDockerComposeSecurity();
  let allPassed = true;

  for (const c of checks) {
    const icon = c.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`[${icon}] ${c.check}: ${c.details}`);
    if (!c.passed) allPassed = false;
  }

  console.log("================================================================================");
  if (!allPassed) {
    console.error("AUDIT FAILED: One or more Docker Compose security requirements were not met.");
    process.exit(1);
  } else {
    console.log("AUDIT PASSED: All Docker Compose security requirements verified.");
    process.exit(0);
  }
}
