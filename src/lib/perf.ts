import "server-only";

// 処理にかかった時間をサーバーの記録に残す（表示の速さの調査用）。記録するのは処理の名前と時間だけ（利用者の ID や中身は残さない）
export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work();
  } finally {
    console.info("perf", { label, ms: Math.round(performance.now() - start) });
  }
}
