// テナント内のロール（DB の membership_role と同じ値）
export type Role = "owner" | "member";

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", member: "Member" };
