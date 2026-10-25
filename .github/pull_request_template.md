## 変更内容

## セキュリティチェック
- [ ] `/code-review` を実行し、指摘と対応をこの PR に記載した
- [ ] 新しいテーブル・関数に RLS と grant をマイグレーションで明示した（該当する場合）
- [ ] `service_role` を新たに使っていない（使う場合は理由と箇所を記載）
- [ ] 認可チェックを Server Action・Route Handler の中で行っている（middleware に任せていない）
- [ ] 秘密情報をコミットしていない

## レビュー結果（/code-review）
