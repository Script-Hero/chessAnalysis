import type { EngineLine, MoveJudgment, PositionEval, SurveyPosition } from './stockfish'

/**
 * Persistent game store.
 *
 * This is filing, not analysis. Every claim the app makes is about one game,
 * so the store's only job is to keep games and their finished analyses to hand
 * — IndexedDB rather than localStorage because a full-width survey does not fit
 * in the latter, and metadata is kept apart from the bulky analysis so a
 * listing does not have to load one.
 */

const DB_NAME = 'chess-analysis'
const DB_VERSION = 1
const META_STORE = 'games'
const ANALYSIS_STORE = 'analysis'
const LAST_OPENED_KEY = 'chess-analysis:last-opened'

export type GameMeta = {
  id: string
  fileName: string
  pgn: string
  headers: Record<string, string>
  savedAt: number
  /** Whether a completed analysis exists for this game. */
  analyzed: boolean
}

export type StoredAnalysis = {
  id: string
  evals: PositionEval[]
  judgments: (MoveJudgment | null)[]
  lines: EngineLine[][]
  survey: SurveyPosition[]
}

/**
 * Content-addressed id, so re-importing the same PGN updates the existing entry
 * instead of filling the library with duplicates.
 *
 * FNV-1a over the move text: not cryptographic, but collision risk across a
 * personal game library is negligible and it needs no async crypto API.
 */
export function gameId(pgn: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < pgn.length; i++) {
    hash ^= pgn.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36) + '-' + pgn.length.toString(36)
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(ANALYSIS_STORE)) db.createObjectStore(ANALYSIS_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = fn(tx.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function saveGameMeta(meta: GameMeta): Promise<void> {
  await run(META_STORE, 'readwrite', (s) => s.put(meta))
}

export async function saveAnalysis(analysis: StoredAnalysis): Promise<void> {
  await run(ANALYSIS_STORE, 'readwrite', (s) => s.put(analysis))
  const meta = await run<GameMeta | undefined>(META_STORE, 'readonly', (s) => s.get(analysis.id))
  if (meta) await saveGameMeta({ ...meta, analyzed: true })
}

export async function loadAnalysis(id: string): Promise<StoredAnalysis | null> {
  const result = await run<StoredAnalysis | undefined>(ANALYSIS_STORE, 'readonly', (s) => s.get(id))
  return result ?? null
}

export async function listGames(): Promise<GameMeta[]> {
  const all = await run<GameMeta[]>(META_STORE, 'readonly', (s) => s.getAll())
  return all.sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteGame(id: string): Promise<void> {
  await run(META_STORE, 'readwrite', (s) => s.delete(id))
  await run(ANALYSIS_STORE, 'readwrite', (s) => s.delete(id))
  if (getLastOpenedId() === id) clearLastOpenedId()
}

export function setLastOpenedId(id: string): void {
  try {
    localStorage.setItem(LAST_OPENED_KEY, id)
  } catch {
    // Best-effort: losing the pointer only costs a re-pick from the library.
  }
}

export function getLastOpenedId(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_KEY)
  } catch {
    return null
  }
}

export function clearLastOpenedId(): void {
  try {
    localStorage.removeItem(LAST_OPENED_KEY)
  } catch {
    // ignore
  }
}

