Simple local container deployment + free public exposure using ngrok

Overview
- This guide shows how to run the app in Docker locally and expose it publicly with ngrok (free tunneling) so generated QR codes point to a reachable HTTPS URL.

Prereqs
- Docker & docker-compose installed on your machine
- Optional: ngrok account or the ngrok binary (free plan works)

Steps
1) Build and run with docker-compose

```bash
# build and start in background
docker-compose up -d --build

# view logs
docker-compose logs -f app
```

Files persisted in `./db` and `./public/qrcodes` so QR images and database survive container restarts.

2) Run ngrok to expose port 3000 (HTTPS)

If you have the `ngrok` binary installed, run:

```bash
ngrok http 3000
```

This prints a forwarding URL like `https://abcd-1234.ngrok.io`. Use the HTTPS URL when printing QR codes.

- Open `https://<ngrok-host>/admin` to reach the admin login page.
- When the admin UI generates a QR (e.g. `/qrcodes/register-<id>.png`), it will point to the same host because ngrok forwards the `Host` header.

3) Set stronger secrets (recommended)

When running locally, you may pass environment variables in `docker-compose.yml` or via CLI:

- `SESSION_SECRET` — set a secure random value
- `ADMIN_PASSWORD` — initial admin password (overrides default "password")

Example to run with environment overrides:

```bash
SESSION_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD="StrongPass!234" docker-compose up -d --build
```

4) Alternatives
- If you prefer not to use ngrok, you can deploy to a small VPS and use the supplied `deploy/checkin-app.service` and `deploy/nginx.checkin-app.conf` as templates.
- If you want a container registry based deploy (Render/Fly/Railway), the Dockerfile here will work as-is.

Notes
- Ensure `utils/logog.png` is present (put your logo in `utils/logog.png`) so login and PDF generation include your logo.
- When using ngrok, the printed wall QR should use the HTTPS ngrok host — that is what the admin UI will produce once you generate the shared QR while ngrok is running.

If you want, I can also:
- Create a simple script that generates a printable PDF with the shared QR and instructions.
- Provide a one-line command to run ngrok automatically and open the admin page.

*** End Patch