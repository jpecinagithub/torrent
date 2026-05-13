import { JsonDb } from './json-db'

export function openDb(filePath: string): JsonDb {
  return new JsonDb(filePath)
}
