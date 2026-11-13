const URLS = /(?:https?|rtsps?|rtmps?):\/\/[^\s"'<>]+/gi;
export function redact(value, env = process.env) {
  let message = String(value).replace(URLS, (value) => {
    try { const url = new URL(value); return `${url.protocol}//${url.hostname}/[redacted]`; } catch { return '[redacted URL]'; }
  });
  for (const name of ['DISCORD_BOT_TOKEN', 'DISCORD_TOKEN', 'JELLYFIN_API_KEY', 'TVHEADEND_PASS', 'APP_PASSWORD']) {
    if (env[name]) message = message.replaceAll(env[name], '[redacted]');
  }
  return message;
}
export function createLogger(env = process.env) {
  const levels = { DEBUG: 0, INFO: 1, WARN: 2, WARNING: 2, ERROR: 3 };
  const result = {};
  for (const [name, number] of Object.entries({ debug: 0, info: 1, warn: 2, error: 3 })) {
    result[name] = (message) => {
      const threshold = levels[String(env.LOG_LEVEL || 'INFO').toUpperCase()] ?? 1;
      if (number < threshold) return;
      const safe = redact(message instanceof Error ? `${message.name}: ${message.message}` : message, env);
      (number >= 2 ? console.error : console.log)(`${new Date().toISOString()} ${name.toUpperCase()} ${safe}`);
    };
  }
  return result;
}
export const log = createLogger();
