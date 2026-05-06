const { PUSHOVER_TOKEN, PUSHOVER_USER } = process.env;
if (!PUSHOVER_TOKEN || !PUSHOVER_USER) process.exit(0);

await fetch('https://api.pushover.net/1/messages.json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    title: 'barryfrost-v7',
    message: 'Deploy succeeded',
  }),
});
