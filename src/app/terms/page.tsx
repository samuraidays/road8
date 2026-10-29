import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { POLICY_EFFECTIVE_DATE } from "@/lib/site";

export const metadata: Metadata = { title: "利用規約 | road8" };

export default function TermsPage() {
  return (
    <LegalPage title="利用規約" effective={POLICY_EFFECTIVE_DATE}>
      <Section title="1. このサービスについて">
        <p>road8（以下「本サービス」）は、人生のゴールから OKR・タスク・習慣を立て、振り返るための Web サービスです。個人が運営しており、セキュリティの評価・診断の実践にも使っています。</p>
      </Section>
      <Section title="2. 利用の条件">
        <ul className="list-disc pl-5">
          <li>本サービスは無料で、予告なく内容を変更・停止・終了することがあります。</li>
          <li>アカウントとパスワードは、ご自身で管理してください。</li>
          <li>法令や公序良俗に反する利用、本サービスや他の利用者への不正なアクセス、過度な負荷をかける行為を禁止します。</li>
          <li>脆弱性を見つけた場合は、公開する前に<Link href="/privacy#security" className="underline">連絡先</Link>へお知らせください。</li>
        </ul>
      </Section>
      <Section title="3. 入力したデータ">
        <p>入力したデータの権利は、入力した利用者に帰属します。運営者は、本サービスの提供と、障害・不正の調査に必要な範囲でだけ扱います。扱い方は<Link href="/privacy" className="underline">プライバシーポリシー</Link>のとおりです。</p>
      </Section>
      <Section title="4. 免責">
        <p>本サービスは現状のまま提供し、データの消失や、本サービスを使ったことによる損害について、運営者は責任を負いません。バックアップは取っていないため、大切な情報はご自身でも控えてください。</p>
      </Section>
      <Section title="5. 規約の変更">
        <p>この規約を変えるときは、本サービス上で知らせます。</p>
      </Section>
    </LegalPage>
  );
}
