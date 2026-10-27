"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hashInvitationToken, isInvitationToken } from "@/lib/invitation-token";
import { acceptInvitation } from "@/lib/supabase/service";

export type AcceptState = { error?: string };

// 失敗の理由（存在しない・使用済み・期限切れ・取り消し済み・所属済み）を区別しない（設計書 §9-3）
const INVALID_MESSAGE = "この招待リンクは使えません。期限切れか使用済みの可能性があります。招待した人に新しいリンクを依頼してください";

export async function acceptInvitationAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  if (!isInvitationToken(token)) {
    return { error: INVALID_MESSAGE };
  }

  const tenantId = await acceptInvitation(hashInvitationToken(token), user.id);
  if (!tenantId) {
    return { error: INVALID_MESSAGE };
  }

  revalidatePath("/app", "layout");
  redirect(`/app/${tenantId}`);
}
