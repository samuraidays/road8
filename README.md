# road8

個人・チーム向けの OKR とタスク管理のマルチテナント SaaS。

- Next.js（App Router）／TypeScript
- Vercel（ホスティング）
- Supabase（Postgres・Auth、テナント分離は RLS）

## 開発

開発はローカルの Supabase（Docker）で行う。ステージング環境はない。

```bash
npm ci
supabase start                # ローカルの Supabase を起動（初回はイメージを取得）
supabase status               # API URL と publishable key を確認
cp .env.example .env.local    # 上の値を入れる（コミットしない）
npm run dev
```

## セキュリティ

脆弱性を見つけた場合は、公開の Issue ではなく、GitHub の「Report a vulnerability」（Security タブ）から報告してください。
