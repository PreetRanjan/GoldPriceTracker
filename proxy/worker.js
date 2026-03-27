const UPSTREAM_URL =
  "https://api.lalithaajewellery.com/public/pricings/latest?state_id=fbe51d69-c3ef-466f-a8f4-7c382759e35f";
const ALLOWED_ORIGINS = new Set(["https://preetranjan.github.io"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    if (request.method === "OPTIONS") {
      return handleOptions(origin);
    }

    if (origin && !isAllowedOrigin(origin)) {
      return jsonResponse(
        {
          status: "error",
          message: "Origin not allowed",
        },
        403,
      );
    }

    if (url.pathname !== "/latest") {
      return withCors(
        new Response(JSON.stringify({ message: "Not found" }), {
          status: 404,
          headers: {
            "content-type": "application/json; charset=UTF-8",
          },
        }),
        origin,
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
        origin,
      );
    } catch (error) {
      return withCors(
        jsonResponse(
          {
            status: "error",
            message: "Proxy request failed",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          502,
        ),
        origin,
      );
    }
  },
};

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin);

  Object.entries(cors).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function handleOptions(origin) {
  if (!isAllowedOrigin(origin)) {
    return new Response(null, {
      status: 403,
      headers: {
        vary: "Origin",
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function isAllowedOrigin(origin) {
  return typeof origin === "string" && ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
    vary: "Origin",
  };
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
    },
  });
}
