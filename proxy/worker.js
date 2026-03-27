const UPSTREAM_URL =
  "https://api.lalithaajewellery.com/public/pricings/latest?state_id=fbe51d69-c3ef-466f-a8f4-7c382759e35f";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname !== "/latest") {
      return withCors(
        new Response(JSON.stringify({ message: "Not found" }), {
          status: 404,
          headers: {
            "content-type": "application/json; charset=UTF-8",
          },
        }),
      );
    }

    try {
      const upstreamResponse = await fetch(UPSTREAM_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const text = await upstreamResponse.text();

      return withCors(
        new Response(text, {
          status: upstreamResponse.status,
          headers: {
            "content-type":
              upstreamResponse.headers.get("content-type") ||
              "application/json; charset=UTF-8",
            "cache-control": "public, max-age=60",
          },
        }),
      );
    } catch (error) {
      return withCors(
        new Response(
          JSON.stringify({
            status: "error",
            message: "Proxy request failed",
            details: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 502,
            headers: {
              "content-type": "application/json; charset=UTF-8",
            },
          },
        ),
      );
    }
  },
};

function withCors(response) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders();

  Object.entries(cors).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
  };
}
