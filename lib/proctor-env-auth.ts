import crypto from "node:crypto";

const getExpectedUsername = () => process.env.PROCTOR_TEST_USERNAME ?? "proctor";
const getExpectedPassword = () => process.env.PROCTOR_TEST_PASSWORD ?? "proctor123";
const getAuthSecret = () => process.env.PROCTOR_TEST_AUTH_SECRET ?? "proctor-dev-secret";

const buildToken = (username: string, password: string) =>
  crypto
    .createHmac("sha256", getAuthSecret())
    .update(`${username}:${password}`)
    .digest("hex");

export const loginWithEnvCredentials = ({
  username,
  password,
}: {
  username: string;
  password: string;
}) => {
  if (username !== getExpectedUsername() || password !== getExpectedPassword()) {
    return null;
  }

  return buildToken(username, password);
};

export const isAuthorizedRequest = (request: Request) => {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return false;
  }

  const expectedToken = buildToken(getExpectedUsername(), getExpectedPassword());

  if (token.length !== expectedToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
};
