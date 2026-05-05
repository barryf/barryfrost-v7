interface Env {
  PUSHOVER_TOKEN: string;
  PUSHOVER_USER: string;
  WEBHOOK_SIGNING_SECRET: string;
}

interface DeploymentStage {
  name: string;
  status: string;
}

interface DeploymentPayload {
  project_name?: string;
  environment?: string;
  url?: string;
  latest_stage?: DeploymentStage;
  stages?: DeploymentStage[];
  deployment_trigger?: {
    metadata?: {
      branch?: string;
      commit_hash?: string;
      commit_message?: string;
    };
  };
}

async function verifySignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(body));
}

async function sendPushover(env: Env, title: string, message: string, url?: string): Promise<void> {
  const body: Record<string, string> = {
    token: env.PUSHOVER_TOKEN,
    user: env.PUSHOVER_USER,
    title,
    message,
  };
  if (url) body.url = url;

  await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const body = await request.text();
    const signature = request.headers.get('CF-Webhook-Signature');

    const valid = await verifySignature(body, signature, env.WEBHOOK_SIGNING_SECRET);
    if (!valid) {
      return new Response('Unauthorized', { status: 401 });
    }

    let payload: DeploymentPayload;
    try {
      payload = JSON.parse(body) as DeploymentPayload;
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const stage = payload.latest_stage ?? payload.stages?.at(-1);
    const status = stage?.status ?? 'unknown';
    const project = payload.project_name ?? 'barryfrost-v7';
    const branch = payload.deployment_trigger?.metadata?.branch ?? 'unknown';
    const commit = payload.deployment_trigger?.metadata?.commit_message ?? '';
    const deployUrl = payload.url;

    const success = status === 'success';
    const title = `${project}: deploy ${success ? 'succeeded' : 'failed'}`;
    const messageParts = [`Branch: ${branch}`];
    if (commit) messageParts.push(`Commit: ${commit.slice(0, 72)}`);
    messageParts.push(`Status: ${status}`);

    await sendPushover(env, title, messageParts.join('\n'), deployUrl);

    return new Response('OK', { status: 200 });
  },
};
