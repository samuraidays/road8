import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal-page";
import { POLICY_EFFECTIVE_DATE, SECURITY_CONTACT_URL, SOURCE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "プライバシーポリシー | road8" };

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" effective={POLICY_EFFECTIVE_DATE}>
      <Section title="1. 集める情報">
        <ul className="list-disc pl-5">
          <li>アカウント：メールアドレス、パスワード（ハッシュとして保存し、運営者も元のパスワードは見られません）、表示名</li>
          <li>入力したデータ：人生のゴール・柱、OKR、数値の記録、タスク、習慣、振り返り、「なぜ」の欄</li>
          <li>Google カレンダーと連携した場合：カレンダーに予定を書き込むためのトークン（暗号化して保存）。読み書きできるのは、本サービスが作った「road8」カレンダーだけです</li>
          <li>操作の記録：だれが・いつ・どの種類の操作をしたか（監査ログ。題名や文章などの中身は残しません）</li>
          <li>ログイン・アクセスの記録：IP アドレス、日時、結果（認証の仕組みとホスティングの事業者が記録します）</li>
        </ul>
      </Section>
      <Section title="2. 使い道">
        <p>本サービスを提供するため、不正なアクセスや障害を調べるため、セキュリティを評価・改善するためにだけ使います。広告や販売には使いません。</p>
      </Section>
      <Section title="3. 見える範囲">
        <ul className="list-disc pl-5">
          <li>テナント（グループ）に入力したデータは、そのテナントのメンバーに見えます。</li>
          <li>「なぜ」の欄と、週・四半期の振り返りの文章は、同じテナントのメンバー（Owner を含む）にも見えません。ただし、書いた時刻は監査ログとして Owner に見えます。</li>
          <li>監査ログを見られるのは、そのテナントの Owner だけです。</li>
        </ul>
      </Section>
      <Section title="4. 預け先">
        <ul className="list-disc pl-5">
          <li>Supabase（データベース・認証。東京リージョン）</li>
          <li>Vercel（Web サーバー。処理は東京リージョン）</li>
          <li>Google（カレンダー連携を使う場合だけ）</li>
        </ul>
      </Section>
      <Section title="5. 削除">
        <ul className="list-disc pl-5">
          <li>テナントのデータは、Owner が「設定」からテナントを削除すると、すべて消えます（元に戻せません）。監査ログは不正の調査のため残ります。</li>
          <li>Google カレンダーの連携は、「タスク」の画面から解除できます。解除するとトークンも消えます。カレンダーに入れた予定は Google 側に残ります。</li>
          <li>アカウント自体の削除は、下の連絡先からお知らせください。</li>
        </ul>
      </Section>
      <Section id="security" title="6. 連絡先・脆弱性の報告">
        <p>
          脆弱性の報告とお問い合わせは、GitHub の
          <a href={SECURITY_CONTACT_URL} className="underline" rel="noopener noreferrer">非公開の報告フォーム</a>
          から送ってください（内容は運営者にだけ届きます）。ソースコードは <a href={SOURCE_URL} className="underline" rel="noopener noreferrer">GitHub</a> で公開しています。
        </p>
      </Section>
    </LegalPage>
  );
}
