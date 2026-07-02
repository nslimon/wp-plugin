export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/proxy/bdcourier') {
      const proxyToken = request.headers.get('X-CF-Proxy-Token');
      if (proxyToken !== env.AUTH_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }

      // API key worker-এর নিজের secret env থেকে — PHP থেকে আসে না
      if (!env.BDCOURIER_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Worker misconfigured: BDCOURIER_API_KEY not set' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const bodyText = await request.text();

      try {
        const response = await fetch('https://api.bdcourier.com/courier-check', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + env.BDCOURIER_API_KEY,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: bodyText
        });

        const resText = await response.text();
        return new Response(resText, {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
