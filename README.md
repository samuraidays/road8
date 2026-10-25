# road8

個人・チーム向けの OKR とタスク管理のマルチテナント SaaS。

- Next.js（App Router）／TypeScript
- Vercel（ホスティング）
- Supabase（Postgres・Auth、テナント分離は RLS）

## 開発

```bash
npm ci
cp .env.example .env.local   # 値を入れる（コミットしない）
npm run dev
```

## セキュリティ

脆弱性を見つけた場合は、公開の Issue ではなく、GitHub の「Report a vulnerability」（Security タブ）から報告してください。
