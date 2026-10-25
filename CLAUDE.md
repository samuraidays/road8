@AGENTS.md

# road8 開発ルール

OKR＋タスク管理のマルチテナント SaaS。セキュリティ評価・脆弱性診断の題材として作っている。
構成：Next.js（App Router）on Vercel ＋ Supabase（Postgres・Auth）。言語は TypeScript。

## データアクセス（案A）

- サーバー側（Server Actions・Route Handlers）で supabase-js を使い、**ログインユーザーの JWT** で接続する
- ブラウザからも Supabase の Data API に直接届く前提で作る。**主な防御は RLS と grant**。アプリ側の認可チェックは補助

## 必ず守ること

- 業務テーブルには `tenant_id`（NOT NULL・外部キー）を付け、**RLS を有効にする**
- テーブル・関数の権限（grant）は **マイグレーションで明示する**。`anon` に業務テーブルの権限を与えない。既定の自動付与に頼らない
- 所属・ロールは JWT のクレームに入れず、毎回 `memberships` を参照する
- RLS では `auth.uid()` を `(select auth.uid())` の形で書く
- ビューには `security_invoker = true` を付ける
- `SECURITY DEFINER` 関数は `public` スキーマに置かず、実行権限を絞る
- **認可は各 Server Action・Route Handler の中で確認する**。middleware（proxy）だけに任せない
- URL やフォームのテナントIDを信用しない。サーバー側で `memberships` を確認してから処理する
- `service_role` キーを使うのは、本人の権限を超える処理（監査ログの書き込み、招待の受諾など）だけ。使った箇所は `docs/` の一覧に追記する
- 監査ログのテーブルには、`authenticated` に INSERT・UPDATE・DELETE を与えない
- 秘密情報（キー・トークン・パスワード）をコードやログに書かない。`.env*` はコミットしない

## 作業の流れ

- `main` への直接 push はしない。PR を作り、CI（lint・型チェック・build・gitleaks・CodeQL）を通す
- PR では `/code-review` を実行し、指摘と対応を PR に書く
- 環境は本番とローカル開発の2つだけ（ステージングはない）。`production` にマージすると本番に Vercel が自動デプロイする。`main` へのマージではデプロイされない
- マイグレーションは必ずローカルの Supabase（`supabase db reset`）で確認してから本番に流す。本番の DB パスワードや secret キーをローカルのファイルやコードに置かない

## コマンド

```bash
npm run dev        # 開発サーバー
npm run lint
npm run typecheck
npm run build
supabase start     # ローカルの Supabase（Docker）
supabase db reset  # マイグレーションをローカルで適用し直す
supabase stop
```
