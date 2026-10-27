"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { revokeToken } from "@/lib/google";
import { deleteGoogleConnection, getGoogleConnection } from "@/lib/supabase/service";

export type GoogleFormState = { error?: string };

// 連携の解除。Google 側でトークンを取り消し、Vault と連携の行を消す（本人の分だけ）
export async function disconnectGoogle(): Promise<GoogleFormState> {
  const user = await requireUser();
  try {
    const connection = await getGoogleConnection(user.id);
    if (connection) {
      await revokeToken(connection.refreshToken);
    }
    await deleteGoogleConnection(user.id);
  } catch (error) {
    console.error("google.disconnect failed", { userId: user.id, reason: error instanceof Error ? error.message : "unknown" });
    return { error: "連携を解除できませんでした。時間をおいて試してください" };
  }
  revalidatePath("/app", "layout");
  return {};
}
