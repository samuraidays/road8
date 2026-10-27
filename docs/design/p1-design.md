# P1 設計書

- 状態：**確定版 v1**（2026-10-26）。§8 の7項目は叩き台どおりに決定
- 元にした計画：計画書 v1.3 §2（MVP のスコープ）、§4（マルチテナント設計方針）
- 対になるファイル：[`security/permissions.yaml`](../../security/permissions.yaml)（機能×権限マトリクス）

この設計書は公開リポジトリに置く。**設計が見えていても破れないこと**（主な防御は RLS と grant）を前提にする。

---

## 1. 前提

| 項目 | 内容 |
|---|---|
| データアクセス | 案A：サーバー（Server Actions・Route Handlers）で supabase-js を使い、ログインユーザーの JWT で接続する。ブラウザからも Data API に直接届く |
| 主な防御 | RLS とテーブル・関数ごとの grant。アプリ側の認可チェックは補助 |
| テナント分離 | 共有スキーマ＋`tenant_id`＋RLS |
| 環境 | 本番（Supabase 1件）とローカル開発（`supabase start`） |

### 1-1. 利用者の区分（権限マトリクスの列）

| 区分 | 説明 |
|---|---|
| `anonymous` | ログインしていない |
| `non_member` | ログインしているが、対象テナントに所属していない（**テナント越えの攻撃者** はこの立場） |
| `member` | 対象テナントの Member |
| `owner` | 対象テナントの Owner（1テナントに1人以上） |

---

## 2. データモデル

### 2-1. ER 図

```mermaid
erDiagram
    tenants ||--o{ memberships : has
    tenants ||--o{ invitations : has
    tenants ||--o{ objectives : has
    objectives ||--o{ key_results : has
    key_results ||--o{ tasks : has
    memberships ||--o{ tasks : "assignee"
    profiles ||--o{ memberships : ""
    profiles ||--o| google_connections : ""
    tenants ||--o{ audit_logs : ""

    tenants { uuid id PK; text name; uuid created_by; timestamptz created_at }
    memberships { uuid tenant_id PK; uuid user_id PK; role role; timestamptz created_at }
    invitations { uuid id PK; uuid tenant_id; role role; text token_hash; uuid invited_by; timestamptz expires_at; timestamptz accepted_at; timestamptz revoked_at }
    profiles { uuid user_id PK; text display_name }
    objectives { uuid id PK; uuid tenant_id; text title; date period_start; date period_end; uuid owner_user_id }
    key_results { uuid id PK; uuid tenant_id; uuid objective_id; text title; int progress }
    tasks { uuid id PK; uuid tenant_id; uuid key_result_id; text title; uuid assignee_user_id; date due_date; task_status status; text calendar_event_id }
    google_connections { uuid user_id PK; uuid vault_secret_id; text scopes; timestamptz connected_at; timestamptz revoked_at }
    audit_logs { bigint id PK; uuid tenant_id; uuid actor_user_id; text action; text result; jsonb metadata; timestamptz created_at }
```

### 2-2. テーブル

| テーブル | 主な列 | ポイント |
|---|---|---|
| `tenants` | `id`, `name`, `created_by`, `created_at` | |
| `memberships` | `(tenant_id, user_id)` が主キー、`role`（`owner` / `member`） | 所属とロールの **唯一の正本**。JWT には入れない |
| `invitations` | `tenant_id`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at` | 招待トークンは **ハッシュだけ** を保存。有効期限は72時間。1回使ったら無効 |
| `profiles` | `user_id`（`auth.users` の ID）, `display_name` | 担当者名の表示用。メールアドレスは持たない |
| `objectives` | `tenant_id`, `title`, `description`, `period_start`, `period_end`, `owner_user_id` | |
| `key_results` | `tenant_id`, `objective_id`, `title`, `progress`（0〜100、手入力） | |
| `tasks` | `tenant_id`, `key_result_id`, `title`, `assignee_user_id`, `due_date`, `status`（`todo` / `in_progress` / `done`）, `calendar_event_id` | |
| `google_connections` | `user_id`, `vault_secret_id`, `scopes`, `connected_at`, `revoked_at` | リフレッシュトークン本体は **Supabase Vault** に置き、ここには参照 ID だけ |
| `audit_logs` | `id`（連番）, `tenant_id`, `actor_user_id`, `action`, `target_type`, `target_id`, `result`（`success` / `denied` / `error`）, `ip`, `user_agent`, `request_id`, `metadata`, `created_at` | 追記専用。連番 ID は後続フェーズでの取得位置管理に使う |

全テーブル共通：`created_at`、更新するものは `updated_at`（トリガーで更新）。業務テーブルの `tenant_id` は NOT NULL。

### 2-3. テナントの整合性を DB で強制する（複合外部キー）

`tenant_id` を各テーブルに持たせるだけだと、「テナントAの Key Result に、テナントBの Objective をつなぐ」ような **親子でテナントが食い違う行** を作れてしまう。これを DB の制約で防ぐ。

| 子 | 制約 | 防げること |
|---|---|---|
| `key_results` | `(objective_id, tenant_id)` → `objectives(id, tenant_id)` | 他テナントの Objective へのぶら下げ |
| `tasks` | `(key_result_id, tenant_id)` → `key_results(id, tenant_id)` | 他テナントの Key Result へのぶら下げ |
| `tasks` | `(tenant_id, assignee_user_id)` → `memberships(tenant_id, user_id)` | テナント外のユーザーを担当者にする |
| `objectives` | `(tenant_id, owner_user_id)` → `memberships(tenant_id, user_id)` | 同上 |

親側には `unique (id, tenant_id)` を付ける。メンバーを外したときは担当者を空にする（`ON DELETE SET NULL`、§8 #3）。

---

## 3. 権限（grant）と RLS

### 3-1. grant の方針

1. `public` スキーマの既定の権限を取り消す（`anon` / `authenticated` / `service_role` へのテーブル・関数・シーケンスの自動付与を止める）。関数は PostgreSQL 全体の既定で PUBLIC にも実行権限が付くので、`alter default privileges for role postgres revoke execute on functions from public` も行う（§7 #2）
2. 必要な権限だけをテーブルごとに付与する。**`anon` には業務テーブルの権限を一切与えない**
3. 全テーブルで RLS を有効にする。RLS が無効なテーブルや、`anon` に権限があるテーブルを CI で検出する（P1 で作るテスト）

| テーブル | `authenticated` に与える権限 |
|---|---|
| `tenants` | SELECT, INSERT, UPDATE, DELETE |
| `memberships` | SELECT, UPDATE, DELETE（INSERT は与えない：§3-3） |
| `invitations` | SELECT, INSERT, UPDATE（取り消しだけ） |
| `profiles` | SELECT, UPDATE |
| `objectives` / `key_results` / `tasks` | SELECT, INSERT, UPDATE, DELETE |
| `google_connections` | SELECT（自分の行のメタ情報だけ） |
| `audit_logs` | SELECT（Owner が自テナント分だけ）。**INSERT・UPDATE・DELETE は与えない** |

列単位の制限が必要な箇所（例：`tasks.tenant_id` を UPDATE で書き換えさせない）は、列単位の grant で止める。`invitations` と `google_connections` は SELECT も列単位なので、アプリは `select *` を使わず列を列挙する。

既定の権限の取り消しは、`postgres` が作るオブジェクトだけが対象。`supabase_admin` が `public` に作るオブジェクト（拡張機能など）には、今も `anon` / `authenticated` への自動付与が残る（`postgres` からは変更できない）。`public` に拡張機能を入れない運用にし、RLS のテスト（anon の権限がないこと）で検出する。

### 3-2. 補助関数（`private` スキーマ）

RLS から呼ぶ所属確認の関数は `private` スキーマに置く。`private` は Data API に公開しないので、RPC として外から呼ばれない。

| 関数 | 内容 |
|---|---|
| `private.is_member(tenant_id)` | `(select auth.uid())` がそのテナントに所属しているか |
| `private.is_owner(tenant_id)` | `(select auth.uid())` がそのテナントの Owner か |
| `private.shares_tenant(user_id)` | 自分とその利用者が同じテナントに所属しているか（`profiles` の閲覧用） |

いずれも `SECURITY DEFINER`・`STABLE`・`search_path` を固定し、`EXECUTE` は `authenticated` だけに与える（`memberships` のポリシーから `memberships` を直接参照すると無限再帰になるため、関数経由にする）。

### 3-3. RLS ポリシー（要約）

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `tenants` | 所属している | ログインしていれば可（`created_by = 自分`）。作成と同時にトリガーで Owner の所属を作る | Owner | Owner |
| `memberships` | 同じテナントの所属者 | **不可**（招待の受諾はサーバーが `service_role` で行う） | Owner（ロール変更。最後の Owner は降格できない：トリガー） | Owner（他人を外す）、本人（脱退。最後の Owner は不可） |

最後の Owner の保護（トリガー）は、テナントの行をロックしてから確認する（2人の Owner が同時にお互いを降格して Owner が0人になるのを防ぐ）。**最後の Owner のアカウントは削除できない**ので、退会・アカウント削除の手順では、先に Owner を引き継ぐか、テナントを削除する。
| `invitations` | Owner | Owner | Owner（取り消しだけ） | 不可 |
| `profiles` | 自分、または同じテナントの所属者 | 不可（サインアップ時にトリガーで作る） | 自分 | 不可 |
| `objectives` | 所属している | 所属している | 所属している | **Owner**（§8 #2） |
| `key_results` | 所属している | 所属している | 所属している | 所属している |
| `tasks` | 所属している | 所属している | 所属している | 所属している |
| `google_connections` | 自分 | 不可（サーバーが保存） | 不可 | 不可（連携解除はサーバー経由） |
| `audit_logs` | 自テナントの Owner | 不可 | 不可 | 不可 |

### 3-4. `service_role` を使う箇所（一覧。ここ以外では使わない）

| 箇所 | 理由 |
|---|---|
| 招待の受諾 | 受諾する時点では、まだそのテナントに所属していないため。トークンのハッシュ・有効期限・未使用を確認してから所属を作る（DB 関数 `accept_invitation`、§9-3） |
| アプリ監査ログの書き込み | `authenticated` に INSERT を与えないため（利用者が偽のログを書けないように） |
| Google のトークンの保存・読み出し・削除 | Vault（`vault.secrets`・`vault.decrypted_secrets`）を利用者のロールから触らせないため（§8 #5） |
| ログイン・サインアップでの Auth の呼び出し（`createAuthEndpointClient`） | サーバーから Auth を呼ぶと、Supabase にはサーバーの IP しか見えない。利用者の IP を `Sb-Forwarded-For` で渡すには secret キーが必要（Supabase の仕様）。**Auth の呼び出しにだけ使い、データの読み書きには使わない**。secret キーが未設定なら IP を渡さずに publishable キーで呼ぶ |

`service_role` のキーはサーバー側の環境変数だけに置き、`server-only` のモジュールからしか読めないようにする。`service_role` で書き込むときは、操作した利用者の ID を `x-road8-actor` ヘッダーで渡す。監査ログのトリガーは、ロールが `service_role` のときだけこのヘッダーを操作者として採用し、`metadata.via = service_role` を残す。

---

## 4. 認証

| 項目 | 決定 |
|---|---|
| ログイン方法 | Google ログイン＋メールとパスワード（§8 #1） |
| パスワードの条件 | 12文字以上（Supabase の既定は6文字）。漏えいしたパスワードの拒否は有料プランの機能【要確認】 |
| メール確認 | 有効にする。本番でメールを送るには独自の SMTP が必要【要確認：Supabase 既定のメール送信の制限】 |
| セッション | `@supabase/ssr` の Cookie。**ブラウザ側で Supabase を使わないので HttpOnly にする**（`SameSite=Lax`、本番は `Secure`）。`proxy.ts` は `/app` 配下だけでトークンの更新を行い（公開ページでは Auth を呼ばない）、認可は各ページ・Server Action で `requireUser()`（`getUser()` で Auth サーバーに確認）を呼んで行う。ロール変更・脱退は DB を毎回参照するので、トークンの失効を待たずに反映される |
| ログアウト | この端末のセッションだけを終了する（`scope: local`）。失敗したらエラーにする |
| 利用者の IP | ログイン・サインアップでは、Vercel が設定する `x-forwarded-for` の先頭（IP として正しいものだけ）を `Sb-Forwarded-For` で Auth に渡す。Auth のレート制限とログが利用者ごとになる（本番で IP 転送の設定を有効にする必要がある） |
| エラーの表示 | ログイン失敗は「メールアドレスかパスワードが違います」に統一（アカウントの有無を区別しない）。サインアップは、登録済みのアドレスでも同じ「確認メールを送りました」を返す |
| 確認メールの戻り先 | サーバーの環境変数 `SITE_URL` から作る（リクエストの Host ヘッダーは使わない）。戻り先 `/auth/callback` は固定で、`next` などのパラメーターでリダイレクト先を変えられない |
| 招待 | Owner が招待リンクを発行して手渡しする（メールは送らない）。リンクにはトークン本体（URL のフラグメント）、DB にはハッシュ。有効期限は72時間（§8 #7）。取り消しの画面は作らない（§9） |
| ログイン失敗の記録 | `auth.audit_log_entries` には **失敗が記録されない**（§7 #1）。失敗の正本は Auth サービスのログ（本番は Log Explorer、無料プランは1日分）。成功・サインアップなどは `auth.audit_log_entries` |

---

## 5. 監査ログ

| 記録するもの | 記録方法 | 例（`action`） |
|---|---|---|
| ログイン・ログアウト・パスワード変更など | Supabase Auth の監査ログ | （Supabase 側） |
| データの変更 | DB トリガー（`SECURITY DEFINER`） | `objective.create`、`task.update`、`membership.role_change` |
| 認可で拒否されたこと（アプリ側で検知できたもの） | サーバー（`service_role`） | `task.update` ＋ `result=denied` |
| 招待の発行・受諾・取り消し | サーバー | `invitation.accept` |
| Google 連携の接続・解除・失敗 | サーバー | `google.connect` |

- **RLS で拒否された操作は、DB からは何も返らないだけで記録に残らない**（Data API を直接叩かれた場合も同じ）。この限界は評価レポートに書く
- トークン・パスワード・招待トークンは `metadata` に入れない

---

## 6. Google カレンダー連携

- ログイン用（`openid` `email` `profile`）とカレンダー用のスコープを分け、カレンダー連携のときだけ追加で同意を求める
- カレンダー用のスコープは `calendar.app.created`（§8 #6）。予定は road8 用に作るカレンダーに入る
- リフレッシュトークンは Vault に保存し、`google_connections` には参照 ID だけを持つ
- OAuth 同意画面は「テスト」状態のまま運用する（7日でリフレッシュトークンが失効するので、再連携の導線を用意する）

### 6-1. 実装（2026-10-27）

| 項目 | 内容 |
|---|---|
| 連携の開始 | `/app/google/connect`（ログイン必須）。`state`（CSRF 対策）と PKCE の `verifier` を作り、HttpOnly・`SameSite=Lax`・`Path=/app/google`・10分の Cookie に入れて Google の同意画面へ送る。`access_type=offline`・`prompt=consent` で毎回リフレッシュトークンを受け取る |
| 戻り | `/app/google/callback`。Cookie を1回で消し、`state` を定数時間で照合、`verifier` を付けてコードを交換。受け取ったスコープに `calendar.app.created` があることを確かめる。戻り先は「テナントのタスク・OKR の画面」だけ（オープンリダイレクト対策） |
| トークンの保管 | `service_role` から DB 関数 `save_google_connection`・`get_google_connection`・`delete_google_connection` を呼ぶ（`SECURITY DEFINER` ではない、実行は `service_role` だけ）。本体は Vault、`google_connections` には参照 ID・スコープ・road8 のカレンダー ID |
| カレンダーに入れる | `task.add_to_calendar`。タスクは利用者の JWT で読む（自分が見られるタスクだけ）。初回に road8 用のカレンダーを作る。入れたことのあるタスクは予定を更新する。カレンダーや予定が消されていたら作り直す。予定 ID は利用者の JWT で `tasks.calendar_event_id` に書く |
| 解除 | Google 側でトークンを取り消し（失敗しても続ける）、Vault と連携の行を消す。入れた予定は残る |
| 連携が切れたとき | リフレッシュが `invalid_grant` などで失敗したら「連携し直してください」と出す |
| タスクの編集・削除 | カレンダーに入れたタスクを編集すると予定も更新し、やる日時を消すか、タスクを削除すると予定も消す（Google 側の失敗はタスクの保存を取り消さない） |
| 複数メンバーでの制約 | 予定 ID はタスクに1つだけ持つ。同じタスクを複数のメンバーがそれぞれのカレンダーに入れると、最後に入れた人の予定 ID になり、ほかの人の更新では予定が重複しうる。個人利用では起きないため受け入れる |
| 本番に必要な設定 | Vercel の環境変数 `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`（Sensitive）。Google Cloud の承認済みリダイレクト URI に `https://app.road8.dev/app/google/callback` |

---

## 7. P1 の1週目の確認（2026-10-26 実施、ローカル）

環境：ローカルの Supabase（`supabase start`、Auth は GoTrue v2.197.0）。確認に使ったテーブル・関数・テスト用ユーザーは、確認後に削除した。

| # | 確認 | 結果 | 設計への反映 |
|---|---|---|---|
| 1 | ログイン失敗が `auth.audit_log_entries` に記録されるか | **記録されない**。記録されたのはサインアップと成功したログインだけ。失敗は Auth サービスのリクエストログ（JSON。`error_code: invalid_credentials`、送信元 IP、`request_id`）にだけ残り、**どのメールアドレスへの試行かは残らない** | §4 を修正。ログイン失敗の正本は Auth サービスのログ（本番では Supabase の Log Explorer。無料プランは1日分）。テーブルからは総当たりを検知できないことを評価の指摘事項の候補にする |
| 2 | `public` の既定の権限を取り消せるか | 何もしないと、新しいテーブルに `anon` / `authenticated` の全権限、関数に実行権限が付く（`anon` が公開キーだけで `public` の関数を RPC で呼べることも確認）。スキーマ単位の取り消しでテーブルは止まるが、**関数は止まらない**（PostgreSQL 全体の既定で PUBLIC に実行権限が付くため）。スキーマを指定しない `revoke execute on functions from public` も必要 | 最初のマイグレーションで、テーブル・シーケンス・関数のスキーマ単位の取り消しと、関数の全体の取り消しの両方を行う（§3-1） |
| 3 | `private` スキーマが Data API から見えないか | 公開していないスキーマの関数は、`Content-Profile` を指定しても `PGRST106`（Invalid schema）で拒否された。ただしエラーに公開中のスキーマ名（`public, graphql_public`）が含まれる | 方針どおり。エラーの情報量は評価で扱う（軽微） |
| 4 | 複合外部キーでテナントの食い違いを止められるか | 別テナントの親を指定した INSERT も、既存の行の `tenant_id` だけを書き換える UPDATE も、外部キー違反で失敗した | 方針どおり（§2-3） |

## 8. 決定事項（2026-10-26）

叩き台の段階で未決だった7項目。すべて叩き台どおりに決定した。

| # | 論点 | 決定 | 理由・トレードオフ |
|---|---|---|---|
| 1 | メールとパスワードのログインを入れるか | **入れる** | パスワード総当たりやアカウント列挙など、診断の題材が増える。代わりに本番のメール送信（SMTP）が必要になる |
| 2 | Objective の削除を Owner だけにするか | **Owner だけ** | 権限マトリクスにロールの差が出て、診断の題材になる。Member に許すほうが使い勝手はよい |
| 3 | メンバーを外したときの担当者 | **担当者を空にする**（`SET NULL`） | 外したメンバーの名前が残らない。代わりに「誰が担当だったか」は監査ログで追う |
| 4 | テナントの削除を MVP に入れるか | **入れる**（Owner、確認つき） | プライバシーポリシーのデータ削除と対応させる。監査ログは残す期間を決める |
| 5 | Google のトークンを扱う方法 | **サーバーが `service_role` で Vault を操作** | `service_role` の利用箇所が増える。代わりに `private` スキーマの関数をサーバー専用のロールで呼ぶ方法もあるが、構成が複雑になる |
| 6 | カレンダー用のスコープ | **`calendar.app.created`** | アプリが作ったカレンダーにだけ書ける。利用者の既存の予定に触れないので最小権限。代わりに予定が「road8」用の別カレンダーに入る |
| 7 | 招待リンクの有効期限 | **72時間** | 短いほど安全、長いほど手渡しに余裕がある |

## 9. 招待とメンバー管理の最小構成（2026-10-27、計画書 v1.4）

road8 は個人利用で、実際に他人を招待する予定はない。それでも、**Owner と Member の権限の差**、**招待トークン**、**`service_role` を使う処理** は診断の題材として価値が大きいので、画面を最小限にして作る。DB のテーブル・権限・RLS は §2・§3 のまま変えない（作らない画面の操作も、Data API からは RLS の範囲で実行できる）。

### 9-1. 作るもの・作らないもの

| 作る | 作らない（理由と扱い） |
|---|---|
| 招待リンクの発行（Owner。ロールは Member か Owner を選ぶ） | 招待の取り消し・発行済み招待の一覧：発行したリンクは期限（72時間）まで取り消せない。戦略書で扱う |
| 招待の受け取り（ログインした人が参加する） | メンバーを外す・自分で抜ける：アプリからは外せない（Owner は Data API からは削除できる）。戦略書で扱う |
| メンバー一覧（表示名とロール） | 招待のメール送信：リンクは Owner が手渡しする（§4 のとおり） |
| ロールの変更（Owner。最後の Owner は降格できない：既存のトリガー） | |
| 自分の表示名の設定（メンバー一覧で人を見分けるため。`profile.update_self`） | |

### 9-2. 発行

1. Owner がメンバーの画面でロールを選んで「招待リンクを作る」を押す
2. Server Action が `requireTenant()` で所属を確かめ、Owner でなければ拒否する（RLS でも拒否される）
3. サーバーで 32 バイトの乱数からトークンを作り、**SHA-256 のハッシュだけ** を `invitations` に保存する（利用者の JWT で INSERT。RLS は Owner だけ）。有効期限は DB の既定値（72時間）
4. リンク `SITE_URL/invite#<トークン>` を **その場で1回だけ** 表示する。トークン本体はどこにも保存しない（ログにも書かない）

トークンを URL の `#` 以降（フラグメント）に置くのは、ブラウザがフラグメントをサーバーに送らないため。`?token=` やパスに置くと、Vercel のリクエストログや `Referer` にトークンが残る。

### 9-3. 受け取り

1. `/invite` のページ（ログイン必須）で、ブラウザがフラグメントのトークンを読み、「参加する」ボタンで Server Action に POST する
2. Server Action が `requireUser()` で本人を確かめ、トークンのハッシュを計算する
3. `service_role` のクライアントで、DB 関数 `public.accept_invitation(token_hash, user_id)` を呼ぶ。関数の中で、1つのトランザクションとして次を行う
   - 未使用・未取り消し・期限内の招待を `accepted_at`・`accepted_by` を入れて **条件付きで更新** し、テナントとロールを得る（同時に2回使われても、更新できるのは1回だけ）
   - すでにそのテナントに所属していれば失敗にする（更新も取り消される）
   - `memberships` に所属を作る
4. 成功したらそのテナントのホームに移動する。失敗の理由（存在しない・使用済み・期限切れ・取り消し済み・所属済み）は **区別せず同じメッセージ** にする

`accept_invitation` は `SECURITY DEFINER` にしない（呼び出し元の `service_role` の権限で動く）。実行権限は `service_role` だけに与え、`anon`・`authenticated` からは呼べない。

`service_role` のクライアントは `server-only` のモジュール（`src/lib/supabase/service.ts`）に閉じ込め、外には用途ごとの関数（`acceptInvitation()`）だけを公開する。`x-road8-actor` ヘッダーに本人の ID を入れる（監査ログの操作者になる）。

`/invite` は未ログインでもログイン画面に転送しない。転送するとフラグメント（トークン）が失われるため、「ログインしてからリンクを開き直す」案内を出す。

### 9-4. メンバー一覧とロールの変更

- 一覧は `memberships` と `profiles`（表示名）を利用者の JWT で読む（RLS で自テナントの所属者だけ見える）。メールアドレスは表示しない（`profiles` に持っていない）
- 表示名が空の人は「名前未設定」と表示する
- ロールの変更は Owner だけ。Server Action で `requireTenant()` と Owner であることを確かめ、`memberships.role` を利用者の JWT で UPDATE する（RLS と最後の Owner を守るトリガーが最終的に止める）

## 10. 人生のゴールと OKR の見直し（2026-10-27、計画書 v1.5）

OKR を「人生のゴールを達成するための行動管理」として使えるようにする。画面は4つ：人生のゴール、OKR（年 → 四半期 → Objective → Key Result → タスク・習慣）、週の振り返り、四半期の振り返り。

### 10-1. 見える範囲（2種類）

| 範囲 | 対象 | RLS の条件 |
|---|---|---|
| テナントのメンバー | 人生のゴール、柱、Objective、Key Result、数値の記録、習慣と実施の記録、KR の採点 | `private.is_member(tenant_id)`（既存の OKR と同じ） |
| **本人だけ**（同じテナントの Owner からも見えない） | 柱・Objective の「なぜ」、週の振り返り、四半期の振り返りの文章 | `user_id = (select auth.uid()) and private.is_member(tenant_id)` |

本人だけのデータは、メンバーに見せる表の列にせず **別の表** に分ける（列にすると、行を読めるメンバーに一緒に読まれるため。列単位の grant でも隠せるが、本人かどうかで列の見え方を変えることはできない）。

誰も招待しなければ、実際に見られるのは本人だけになる。招待したときに見せたくないものだけを「本人だけ」にした。

### 10-2. 追加・変更する表

| 表 | 主な列 | ポイント |
|---|---|---|
| `life_goals`（新規） | `tenant_id`（主キー。1テナントに1つ）、`statement`（2000文字まで） | テナントの最終ゴール |
| `pillars`（新規） | `id`、`tenant_id`、`position`、`title`（100文字まで）、`description`（1000文字まで） | 柱（例：① 事業をつくる）。`unique (id, tenant_id)` |
| `objectives`（変更） | `pillar_id` を追加（任意。`(pillar_id, tenant_id)` の複合外部キー、柱を消したら空に）、`year`・`quarter`（1〜4）を追加。`period_start`・`period_end` は四半期に置き換えて削除 | 本番の既存行は `period_start`（なければ作成日）から年と四半期を埋めてから削除する |
| `key_results`（変更） | `kind`（`manual` / `metric`）、`start_value`・`target_value`（数値）、`unit`（20文字まで）、`score`（0.0〜1.0、四半期の採点）、`next_action`（`continue` / `stop` / `change`） | `metric` の進捗は最新の記録から計算する（`progress` は `manual` のときだけ使う）。採点と次の扱いはメンバーに見せる |
| `kr_measurements`（新規） | `id`、`tenant_id`、`key_result_id`（複合外部キー）、`measured_on`（日付）、`value`、`created_by` | 数値の記録。`unique (key_result_id, measured_on)`（同じ日は上書き） |
| `habits`（新規） | `id`、`tenant_id`、`key_result_id`（複合外部キー）、`title`（200文字まで）、`times_per_week`（1〜7）、`archived_at` | 習慣 |
| `habit_checks`（新規） | `tenant_id`、`habit_id`（複合外部キー）、`done_on`（日付）、`created_by`。主キー `(habit_id, done_on)` | 実施の記録（1日1回まで） |
| `reasons`（新規・本人だけ） | `id`、`tenant_id`、`user_id`、`pillar_id` か `objective_id` のどちらか1つ（check で強制、それぞれ複合外部キー）、`body`（2000文字まで） | 「なぜ」。`unique (user_id, pillar_id)`・`unique (user_id, objective_id)` |
| `weekly_reviews`（新規・本人だけ） | `id`、`tenant_id`、`user_id`、`week_start`（月曜の日付）、`went_well`・`went_wrong`・`next_focus`（各2000文字まで） | `unique (tenant_id, user_id, week_start)` |
| `quarterly_reviews`（新規・本人だけ） | `id`、`tenant_id`、`user_id`、`year`、`quarter`、`learned`・`next_steps`（各2000文字まで） | `unique (tenant_id, user_id, year, quarter)`。KR の採点は `key_results` 側 |

本人だけの表の `user_id` は、`(tenant_id, user_id)` で `memberships` への複合外部キーにする（テナントを抜けたら消える：`on delete cascade`）。

タスクに「いつやるか」の時間帯（`scheduled_start`・`scheduled_end`）を足すのは、タスクの画面を作るときに決める。週の振り返りの「来週やる3つ」は、タスクとして作る。

### 10-3. 権限（grant）と RLS

| 表 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `life_goals` | メンバー | Owner | Owner（`statement`） | 不可（テナントと一緒に消える） |
| `pillars` | メンバー | Owner | Owner（`position`・`title`・`description`） | Owner |
| `objectives`・`key_results` | メンバー（既存） | メンバー（既存） | メンバー（追加した列を含む。`score`・`next_action` もメンバー） | 既存のまま（Objective は Owner、KR はメンバー） |
| `kr_measurements` | メンバー | メンバー | メンバー（`value`） | メンバー |
| `habits` | メンバー | メンバー | メンバー（`title`・`times_per_week`・`archived_at`） | メンバー |
| `habit_checks` | メンバー | メンバー（`created_by` は本人） | 不可 | メンバー |
| `reasons`・`weekly_reviews`・`quarterly_reviews` | **本人だけ** | **本人だけ**（`user_id` は本人） | **本人だけ**（文章の列だけ） | **本人だけ** |

- 列単位の grant で、`tenant_id`・`user_id`・`key_result_id` などを UPDATE で書き換えさせない（既存の方針どおり）
- 人生のゴールと柱の編集を Owner に限るのは、テナントの「方針」にあたるため。個人利用では本人が Owner なので影響はない

### 10-4. 監査ログ

- 新しい表にも `audit_row_change` を付ける。記録するのは操作と変更された列名だけで、文章の中身は残さない（既存の方針どおり）
- ただし本人だけの表（`reasons`・振り返り）の監査ログも、テナントの Owner には見える。**中身は見えないが、「いつ振り返りを書いたか」は Owner に分かる**。個人利用では問題にならないため受け入れ、評価で扱う

### 10-5. 診断で確かめること（追加分）

- 同じテナントの Member・Owner が、他人の「なぜ」・振り返りを、アプリ経由と Data API 直接のどちらでも読めない・書けない・消せない
- 本人だけの表に、他人の `user_id` で INSERT できない（なりすまし）
- 柱・KR・習慣に、他テナントの親をつなげない（複合外部キー）
- 数値の記録・採点の値の範囲（`score` は 0.0〜1.0、`times_per_week` は 1〜7）
