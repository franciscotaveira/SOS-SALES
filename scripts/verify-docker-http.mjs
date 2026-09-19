import { SignJWT } from "../packages/auth/dist/index.js";

const API_URL = process.env.API_URL || "http://localhost:4400";
const secret = process.env.JWT_SECRET;
const issuer = process.env.AUTH_ISSUER || "sos-sales-v3";
const audience = process.env.AUTH_AUDIENCE || "sos-sales-api";

if (!secret) {
  console.error("FATAL: JWT_SECRET environment variable is required to execute HTTP verification.");
  process.exit(1);
}

const secretBytes = new TextEncoder().encode(secret);

console.log(`[verify-docker-http] Testing against Docker API at: ${API_URL}`);

const results = [];

async function testScenario(name, token, expectedStatus) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(`${API_URL}/v1/me`, { headers });
    const status = res.status;
    const passed = status === expectedStatus;

    results.push({
      name,
      expectedStatus,
      observedStatus: status,
      passed,
    });

    console.log(`- ${name}: HTTP ${status} (expected ${expectedStatus}) -> ${passed ? "PASS" : "FAIL"}`);
    return passed;
  } catch (err) {
    console.error(`- ${name}: Connection failed to ${API_URL}:`, err instanceof Error ? err.message : String(err));
    results.push({
      name,
      expectedStatus,
      observedStatus: 0,
      passed: false,
    });
    return false;
  }
}

async function run() {
  let allPassed = true;

  // 1. Missing token
  allPassed = (await testScenario("No token provided", null, 401)) && allPassed;

  // 2. Old default secret (AC08)
  const oldSecretBytes = new TextEncoder().encode("development_fallback_jwt_secret_min_32_chars");
  const oldToken = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "old@test.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("1h")
    .sign(oldSecretBytes);
  allPassed = (await testScenario("Old default secret rejection (AC08)", oldToken, 401)) && allPassed;

  // 3. Wrong issuer (AC05)
  const wrongIssToken = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "test@test.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("untrusted-wrong-issuer")
    .setAudience(audience)
    .setExpirationTime("1h")
    .sign(secretBytes);
  allPassed = (await testScenario("Wrong issuer rejection (AC05)", wrongIssToken, 401)) && allPassed;

  // 4. Wrong audience (AC06)
  const wrongAudToken = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "test@test.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience("untrusted-wrong-audience")
    .setExpirationTime("1h")
    .sign(secretBytes);
  allPassed = (await testScenario("Wrong audience rejection (AC06)", wrongAudToken, 401)) && allPassed;

  // 5. Non-UUID subject (AC07 guard against 500 cast error)
  const nonUuidToken = await new SignJWT({ sub: "attacker-non-uuid", email: "test@test.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("1h")
    .sign(secretBytes);
  allPassed = (await testScenario("Non-UUID subject rejection before database cast (AC07)", nonUuidToken, 401)) && allPassed;

  // 6. Expired token (AC07)
  const expiredToken = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "test@test.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(secretBytes);
  allPassed = (await testScenario("Expired token rejection (AC07)", expiredToken, 401)) && allPassed;

  // 7. Positive control: valid token for user (AC04)
  const validToken = await new SignJWT({ sub: "00000000-0000-0000-0000-000000000001", email: "lab-user@mct.br" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime("1h")
    .sign(secretBytes);
  allPassed = (await testScenario("Valid token positive control (AC04)", validToken, 200)) && allPassed;

  if (!allPassed) {
    console.error("[verify-docker-http] FAILED: Some Docker HTTP assertions failed.");
    process.exit(1);
  } else {
    console.log("[verify-docker-http] SUCCESS: All 7 Docker HTTP positive and negative controls passed!");
  }
}

run().catch((err) => {
  console.error("[verify-docker-http] FATAL in runner:", err);
  process.exit(1);
});
