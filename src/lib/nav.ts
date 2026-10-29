import {
  FlagIcon,
  ListChecksIcon,
  NotebookPenIcon,
  SettingsIcon,
  SunIcon,
  TargetIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  // スマホの下部タブに出すか（出さないものは「その他」にまとめる）
  tab?: boolean;
  ownerOnly?: boolean;
  // PC のメニューで、よく使うものとそれ以外を線で分ける
  secondary?: boolean;
};

// メニュー（設計書 §11）。PC は左、スマホは下部のタブ。
// サーバーの「その他」の画面からも使うので、クライアントのモジュールには置かない
export const NAV_ITEMS: NavItem[] = [
  { label: "今日", path: "", icon: SunIcon, tab: true },
  { label: "ゴール", path: "/goals", icon: TargetIcon },
  { label: "OKR", path: "/okr", icon: FlagIcon, tab: true },
  { label: "タスク", path: "/tasks", icon: ListChecksIcon },
  { label: "振り返り", path: "/reviews/weekly", icon: NotebookPenIcon, tab: true },
  { label: "メンバー", path: "/members", icon: UsersIcon, secondary: true },
  { label: "設定", path: "/settings", icon: SettingsIcon, secondary: true, ownerOnly: true },
];
