"use client";

import { useActionState } from "react";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import type { InviteState } from "@/app/app/[tenantId]/members/actions";
import { controlClassName } from "@/components/okr-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText } from "@/components/ux";
import { ROLE_LABEL } from "@/lib/roles";

// 招待リンクの発行（ダイアログの中で使う）。リンクは1回だけ表示するので、成功してもダイアログは閉じずにリンクとコピーのボタンを出す
export function InviteForm({ action }: { action: (prev: InviteState, formData: FormData) => Promise<InviteState> }) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.link) {
    const link = state.link;
    return (
      <div className="flex flex-col gap-3" role="status">
        <Label htmlFor="invite-link">招待リンク</Label>
        <div className="flex gap-2">
          <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("コピーしました");
              } catch {
                toast.error("コピーできませんでした。リンクを選んでコピーしてください");
              }
            }}
          >
            <CopyIcon aria-hidden="true" />
            コピー
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">招待したい人に直接渡してください。1回だけ使えて、72時間で切れます。このダイアログを閉じると、もう表示されません。</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">参加したときのロール</Label>
        <select id="invite-role" name="role" defaultValue="member" className={controlClassName}>
          <option value="member">{ROLE_LABEL.member}（OKR とタスクを使える）</option>
          <option value="owner">{ROLE_LABEL.owner}（設定・メンバー管理もできる）</option>
        </select>
      </div>
      <ErrorText error={state.error} />
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "作成中…" : "招待リンクを作る"}
      </Button>
    </form>
  );
}
