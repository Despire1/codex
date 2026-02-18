import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../lib/http';

type ResolveSessionUser = (req: IncomingMessage, res: ServerResponse) => Promise<unknown | null>;

type AuthSessionHandlers = {
  handleLogout: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleTelegramWebapp: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
};

type AuthTransferHandlers = {
  handleConsume: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleCreate: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
};

type TryHandleAuthRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  resolveSessionUser: ResolveSessionUser;
  authSessionHandlers: AuthSessionHandlers;
  authTransferHandlers: AuthTransferHandlers;
};

const TRANSFER_PAGE_HTML = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Вход в аккаунт</title>
    <style>
      body { font-family: sans-serif; background: #f5f6fa; margin: 0; padding: 32px; color: #101828; }
      .card { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { margin: 0 0 16px; color: #475467; }
      button { background: #3b82f6; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Подтверждаем вход…</h1>
      <p id="status">Проверяем ссылку и открываем кабинет.</p>
      <button id="retry" style="display:none;">Запросить новую ссылку</button>
    </div>
    <script>
      const params = new URLSearchParams(window.location.search);
      const token = params.get('t');
      const statusEl = document.getElementById('status');
      const retryBtn = document.getElementById('retry');
      const showError = (message) => {
        statusEl.textContent = message;
        retryBtn.style.display = 'inline-block';
        retryBtn.addEventListener('click', () => {
          window.location.href = '/';
        });
      };
      if (!token) {
        showError('Ссылка недействительна. Откройте Mini App и создайте новую ссылку.');
      } else {
        fetch('/auth/transfer/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        })
          .then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.message || 'Не удалось подтвердить вход.');
            }
            const redirectUrl = data.redirect_url || '/';
            window.location.replace(redirectUrl);
          })
          .catch(() => {
            showError('Ссылка устарела или уже использована. Создайте новую в Telegram.');
          });
      }
    </script>
  </body>
        </html>`;

export const tryHandleAuthRoutes = async ({
  req,
  res,
  pathname,
  resolveSessionUser,
  authSessionHandlers,
  authTransferHandlers,
}: TryHandleAuthRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/transfer') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(TRANSFER_PAGE_HTML);
    return true;
  }

  if (req.method === 'GET' && pathname === '/auth/session') {
    const user = await resolveSessionUser(req, res);
    if (!user) {
      sendJson(res, 401, { message: 'unauthorized' });
      return true;
    }
    sendJson(res, 200, { user });
    return true;
  }

  if (req.method === 'POST' && pathname === '/auth/telegram/webapp') {
    await authSessionHandlers.handleTelegramWebapp(req, res);
    return true;
  }

  if (req.method === 'POST' && pathname === '/auth/transfer/create') {
    await authTransferHandlers.handleCreate(req, res);
    return true;
  }

  if (req.method === 'POST' && pathname === '/auth/transfer/consume') {
    await authTransferHandlers.handleConsume(req, res);
    return true;
  }

  if (req.method === 'POST' && pathname === '/auth/logout') {
    await authSessionHandlers.handleLogout(req, res);
    return true;
  }

  return false;
};
