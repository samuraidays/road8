// 文字数をコードポイントで数える（DB の char_length と同じ数え方。JS の length は UTF-16 単位）
export function codePointLength(value: string): number {
  return [...value].length;
}
