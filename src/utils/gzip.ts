const GZIP_MAGIC = [0x1f, 0x8b]

export function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]
}

export async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  writer.close()

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let totalLen = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLen += value.length
  }

  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export async function decodeTextMaybeGzipped(bytes: Uint8Array): Promise<string> {
  if (isGzipped(bytes)) {
    const decompressed = await decompressGzip(bytes)
    return new TextDecoder().decode(decompressed)
  }
  return new TextDecoder().decode(bytes)
}
