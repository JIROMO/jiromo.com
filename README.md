# jiromo.com

JIROMO の公式サイト。静的HTML/CSSサイトで、Cloudflare Workers (Static Assets) で配信する。

## 構成

- `index.html` / `privacy.html` / `terms.html` — ページ
- `style.css` — スタイル
- `favicon.png` / `logo.svg` / `ogp.jpg` — 画像アセット
- `wrangler.jsonc` — Cloudflare Workers 設定（静的アセット配信）

## ローカル開発

```bash
npm install
npm run dev
```

## デプロイ

```bash
npm install
npm run deploy
```

`wrangler deploy` によって Worker `jiromo-com` としてデプロイされ、`jiromo-com.<subdomain>.workers.dev` で公開される。

GitHub連携（Cloudflare Workers Builds）を設定している場合は、`main` ブランチへの push で自動デプロイされる。
