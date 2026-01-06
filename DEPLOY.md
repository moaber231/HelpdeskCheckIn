Deployment steps (systemd + nginx + Let's Encrypt)

1) Create a systemd service to run the Node app (example service file: `deploy/checkin-app.service`)

- Create file `/etc/systemd/system/checkin-app.service` with contents:

[Unit]
Description=HelpDesk Checkin App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/konstantinos/Desktop/checkin-app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /home/konstantinos/Desktop/checkin-app/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target

Reload systemd and enable the service:

sudo systemctl daemon-reload
sudo systemctl enable --now checkin-app.service

2) Nginx reverse proxy (example)

- Create `/etc/nginx/sites-available/checkin-app` with:

server {
    listen 80;
    server_name example.com; # replace with your domain or public IP

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

Enable the site and reload nginx:

sudo ln -s /etc/nginx/sites-available/checkin-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

3) Obtain a TLS certificate (Let's Encrypt / certbot)

sudo apt update && sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d example.com

4) Notes and firewall

- Make sure port 80/443 are reachable (open firewall if necessary).
- Use a non-root user and adjust file paths for your deploy.

5) Optional: run behind a process manager (pm2) instead of systemd, or add a service user and permissions.

If you'd like, I can generate the systemd unit file and a sample Nginx config inside this repo (`deploy/`) so you can review and copy them to the server. Also I can prepare a `Dockerfile` if you prefer containerized deployment.
