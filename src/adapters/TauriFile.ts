import { invoke } from '@tauri-apps/api/core'
import type { GenericFilehandle, Stats, FilehandleOptions, BufferEncoding } from 'generic-filehandle2'

export class TauriFile implements GenericFilehandle {
  constructor(private path: string) {}

  async read(length: number, position: number, _opts?: FilehandleOptions): Promise<Uint8Array> {
    const bytes: number[] = await invoke('read_file_bytes', {
      path: this.path,
      offset: position,
      length,
    })
    return new Uint8Array(bytes)
  }

  async readFile(): Promise<Uint8Array>
  async readFile(options: BufferEncoding): Promise<string>
  async readFile(options?: BufferEncoding | FilehandleOptions): Promise<Uint8Array | string> {
    const bytes: number[] = await invoke('read_file_all', { path: this.path })
    const arr = new Uint8Array(bytes)
    const encoding = typeof options === 'string' ? options : options?.encoding
    if (encoding) {
      return new TextDecoder().decode(arr)
    }
    return arr
  }

  async stat(): Promise<Stats> {
    const size: number = await invoke('file_stat', { path: this.path })
    return { size }
  }

  async close(): Promise<void> {}
}

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export function isFilePath(source: string): boolean {
  return source.startsWith('/') || /^[A-Z]:\\/.test(source)
}
