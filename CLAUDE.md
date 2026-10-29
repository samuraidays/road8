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
- secret キー（`SUPABASE_SECRET_KEY`）を使うのは次の2か所だけ。ほかで secret キーのクライアントを作らない
  - `createAuthEndpointClient()`（`src/lib/supabase/server.ts`）：ログイン・サインアップの Auth 呼び出し専用（`.auth` しか返さない）。データの読み書きには使わない
  - `src/lib/supabase/service.ts`：`service_role` で行う処理を用途ごとの関数として公開する（招待の受諾と Google カレンダー連携のトークンの保存・読み出し・削除）。汎用のクライアントは外に出さない。用途を足すときは設計書 §3-4 の一覧も更新する
- 監査ログのテーブルには、`authenticated` に INSERT・UPDATE・DELETE を与えない
- `invitations` と `google_connections` は列単位で SELECT を与えている（`token_hash`・`vault_secret_id` を読ませない）。supabase-js では `.select()` や `.select('*')` を使わず、**必要な列を列挙する**（`*` は権限エラーになる）
- `service_role` で書き込むときは、操作した利用者の ID を `x-road8-actor` ヘッダーで渡す（監査ログの操作者になる。利用者の JWT では無視される）
- 秘密情報（キー・トークン・パスワード）をコードやログに書かない。`.env*` はコミットしない

## 作業の流れ

- `main` への直接 push はしない。PR を作り、CI（lint・型チェック・build・gitleaks・CodeQL）を通す
- 画面の変更は、本番に出す前に **ローカルで本人に触ってもらって確認する**。手順：`supabase start` と `npm run dev` を起動し、http://localhost:3000 で確認してもらう（ローカルのアカウントは `/signup` で作り、確認メールは Mailpit http://127.0.0.1:54324 で開く）。指摘があればローカルで直してから PR をマージし、本番へリリースする
- PR では `/code-review` を実行し、指摘と対応を PR に書く。重さは変更の種類で分ける
  - **high**：DB（マイグレーション・RLS・権限）、認証・認可、`service_role`、外部連携（OAuth・トークン）、Server Action の追加
  - **medium**：画面だけの変更（見た目・操作・文言）、ドキュメント
- CI の DB テスト（`db-test`）は、`supabase/` が変わったときだけ DB を起動する（それ以外は省略して成功にする）。リリース PR（`main` → `production`）でも同じ
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
