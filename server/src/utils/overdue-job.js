const MAX_PORT = 65535;

export async function runOverdueJobRequest({ hostport, secret, fetchImpl = fetch }) {
  if (typeof hostport !== 'string' || !/^[a-z\d](?:[a-z\d.-]*[a-z\d])?:\d{1,5}$/i.test(hostport)) {
    throw new Error('API_HOSTPORT must contain the internal host and port provided by the hosting platform.');
  }
  const port = Number(hostport.slice(hostport.lastIndexOf(':') + 1));
  if (port < 1 || port > MAX_PORT) throw new Error('API_HOSTPORT contains an invalid port.');
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('CRON_SECRET must contain at least 32 characters.');
  }

  const response = await fetchImpl(`http://${hostport}/api/v1/internal/overdue/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`The overdue endpoint returned HTTP ${response.status}.`);
  return { status: response.status };
}
