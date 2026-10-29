"use client";

import { createContext, useActionState, useContext, useState, useTransition, type ReactNode } from "react";
import { EllipsisIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// 操作の共通ルール（設計書 §11-1）：
// 追加は1行ですばやく、編集・削除は行の「…」メニューから（編集はダイアログ、削除は確認ダイアログ）、
// 文章はクリックでその場で直す、保存したら画面の端に通知を出す

export type ActionResult = { error?: string; message?: string };
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
export type ButtonAction = () => Promise<ActionResult>;

// ダイアログの中のフォームが、保存に成功したらダイアログを閉じるための入口
const DialogDoneContext = createContext<(() => void) | null>(null);

// フォームの送信。成功したら通知を出してダイアログを閉じる。
// エラーのときは、送信後のリセットで入力が消えないように送った値を返し、入力欄の初期値に使う
export function useFormAction(action: FormAction, successMessage = "保存しました") {
  const done = useContext(DialogDoneContext);
  return useActionState<ActionResult & { submitted?: Record<string, string> }, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) {
      toast.success(result.message ?? successMessage);
      done?.();
      return {};
    }
    const submitted: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        submitted[key] = value;
      }
    });
    return { ...result, submitted };
  }, {});
}

export function ErrorText({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

// 「＋ 追加」ボタンでフォームをダイアログに開く
export function AddDialog({
  label,
  title,
  children,
  variant = "outline",
}: {
  label: string;
  title: string;
  children: ReactNode;
  variant?: "outline" | "default" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)} className="self-start">
        <PlusIcon aria-hidden="true" />
        {label}
      </Button>
      <FormDialog open={open} onOpenChange={setOpen} title={title}>
        {children}
      </FormDialog>
    </>
  );
}

function FormDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* 閉じている間は中身を作らない（開くたびに初期値から始める） */}
        {open ? <DialogDoneContext value={() => onOpenChange(false)}>{children}</DialogDoneContext> : null}
      </DialogContent>
    </Dialog>
  );
}

export type MenuItemSpec = { label: string; action: ButtonAction };

// 行の「…」メニュー。編集（ダイアログ）・ほかの操作・削除（確認ダイアログ）
export function RowActions({
  label,
  editTitle,
  editForm,
  items = [],
  deleteTitle,
  deleteDescription,
  deleteAction,
}: {
  label: string;
  editTitle?: string;
  editForm?: ReactNode;
  items?: MenuItemSpec[];
  deleteTitle?: string;
  deleteDescription?: string;
  deleteAction?: ButtonAction;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (action: ButtonAction, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.message) {
          toast.success(result.message);
        }
        after?.();
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={pending} />}
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {editForm ? <DropdownMenuItem onClick={() => setEditing(true)}>編集</DropdownMenuItem> : null}
          {items.map((item) => (
            <DropdownMenuItem key={item.label} onClick={() => run(item.action)}>
              {item.label}
            </DropdownMenuItem>
          ))}
          {deleteAction ? (
            <>
              {editForm || items.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                削除
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {editForm ? (
        <FormDialog open={editing} onOpenChange={setEditing} title={editTitle ?? "編集"}>
          {editForm}
        </FormDialog>
      ) : null}

      {deleteAction ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={deleteTitle ?? "削除しますか？"}
          description={deleteDescription}
          confirmLabel="削除"
          pending={pending}
          onConfirm={() => run(deleteAction, () => setConfirming(false))}
        />
      ) : null}
    </>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  confirmVariant = "destructive",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  confirmVariant?: "destructive" | "default";
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <Button type="button" variant={confirmVariant} disabled={pending} onClick={onConfirm}>
            {pending ? "処理中…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// 確認ダイアログつきのボタン（連携の解除など、行の外にある取り消しにくい操作）
export function ConfirmButton({
  label,
  title,
  description,
  action,
  destructive = true,
}: {
  label: string;
  title: string;
  description?: string;
  action: ButtonAction;
  // 取り消しにくい操作なら true（確認のボタンを赤にする）。下書きを作るなど、消えるものがない操作は false
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" variant={destructive ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={label}
        confirmVariant={destructive ? "destructive" : "default"}
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await action();
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success(result.message ?? "完了しました");
            setOpen(false);
          })
        }
      />
    </>
  );
}

// 1行ですばやく追加する。Enter で作成し、入力欄を空に戻して続けて入力できる
export function QuickAdd({
  action,
  placeholder,
  label,
  name = "title",
}: {
  action: FormAction;
  placeholder: string;
  label: string;
  name?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) {
      toast.success(result.message ?? "追加しました");
    }
    return result;
  }, {});
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <PlusIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input name={name} required placeholder={placeholder} aria-label={label} disabled={pending} className="border-dashed" />
      </div>
      <ErrorText error={state.error} />
    </form>
  );
}

// 文章をクリックしてその場で直す。普段は文章として表示し、空なら書くように案内する
export function InlineText({
  action,
  name,
  value,
  placeholder,
  label,
  className,
  multiline = true,
}: {
  action: FormAction;
  name: string;
  value: string;
  placeholder: string;
  label: string;
  className?: string;
  // false なら1行の入力欄（Enter で保存）
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) {
      toast.success("保存しました");
      setEditing(false);
    }
    return result;
  }, {});

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`${label}を編集`}
        className={cn(
          "w-full rounded-md px-2 py-1.5 text-left text-sm leading-7 whitespace-pre-wrap hover:bg-muted",
          !value && "text-muted-foreground",
          className,
        )}
      >
        {value || placeholder}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {multiline ? (
        <Textarea
          name={name}
          defaultValue={value}
          aria-label={label}
          autoFocus
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
            }
          }}
        />
      ) : (
        <Input
          name={name}
          defaultValue={value}
          aria-label={label}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
            }
          }}
        />
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          キャンセル
        </Button>
        <ErrorText error={state.error} />
      </div>
    </form>
  );
}
