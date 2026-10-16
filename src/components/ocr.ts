"use client"

/**
 * Screenshot → text, entirely in the browser (tesseract.js, WebAssembly). Loaded only when someone
 * picks the Screenshot tab. English + Hindi models; Hindi is best effort.
 */
export async function recognize(image: Blob, onProgress: (p: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker(["eng", "hin"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    await worker.terminate()
  }
}
