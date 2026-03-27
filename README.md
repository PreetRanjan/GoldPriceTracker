# GoldTracker

Static GitHub Pages site for showing today's gold rate, supporting silver and platinum rates, and the API `rate_updated_time` timestamp.

## Files

- `index.html` - page structure
- `styles.css` - custom responsive styling
- `script.js` - API fetch, cache, rendering, and proxy fallback
- `config.js` - optional proxy URL used if direct API fetch is blocked by CORS
- `proxy/worker.js` - tiny Cloudflare Worker proxy
- `proxy/wrangler.toml` - Cloudflare Worker config

## GitHub Pages Deployment

1. Push the repository to GitHub.
1. Ensure the default branch is `main`, because the Pages workflow deploys from pushes to `main`.
1. In the repository settings, open Pages and set the source to GitHub Actions.
1. Push changes to `main` or run the `Deploy GitHub Pages` workflow manually.
1. Wait for the workflow to publish the site URL.

The repository already includes:

- `.github/workflows/deploy-pages.yml` for automatic static deployment
- `.nojekyll` to keep GitHub Pages from applying Jekyll processing
- `.gitignore` rules for local Python, Wrangler, and Node artifacts

## Proxy Deployment For CORS Failures

If the upstream API blocks browser requests from your GitHub Pages domain, use the deployed proxy under the `proxy` folder through Cloudflare Workers.

1. Install Wrangler:

```bash
npm install -g wrangler
```

1. Log in to Cloudflare:

```bash
wrangler login
```

1. From the `proxy` folder, deploy the worker:

```bash
wrangler deploy
```

1. Copy the deployed worker URL.
2. Open `config.js` and set the `/latest` URL:

```js
window.GOLDTRACKER_PROXY_URL =
  "https://your-worker-name.your-subdomain.workers.dev/latest";
```

1. Commit the `config.js` update and redeploy GitHub Pages.

Current deployed worker for this project:

```text
https://goldtracker-pricing-proxy.preetcodes.workers.dev/latest
```

## How The Fallback Works

1. If `window.GOLDTRACKER_PROXY_URL` is set, the site uses the proxy first.
2. If no proxy URL is configured, the site uses the public Lalithaa Jewellery API directly.
3. If the active source fails, the site shows cached data when available or an error panel when no cache exists.
