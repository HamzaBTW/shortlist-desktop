import { realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { applicationFolderFor, isDocPath } from '../shared/documents'

// Opens a drafted file. Only PDFs and .tex drafts inside cv/ or cover_letters/ of the folder, never anything else.

/** Opens one drafted file in the person's own app, or shows it in its folder. */
export async function openDoc(workspace: string, rel: unknown, reveal: unknown): Promise<boolean> {
  if (!isDocPath(rel)) return false
  try {
    const top = path.join(realpathSync(workspace), rel.split('/')[0]!)
    const real = realpathSync(path.join(workspace, rel))
    const inside = path.relative(top, real)
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return false
    if (reveal === true) {
      // Show the application's own folder (cv/<company>_<role>/) when it exists, else the file.
      const folderRel = applicationFolderFor(rel)
      if (folderRel) {
        try {
          const folder = realpathSync(path.join(workspace, folderRel))
          const within = path.relative(top, folder)
          if (statSync(folder).isDirectory() && within !== '' && !within.startsWith('..') && !path.isAbsolute(within)) {
            return (await shell.openPath(folder)) === ''
          }
        } catch {
          // No such folder yet: fall back to the file's own folder.
        }
      }
      shell.showItemInFolder(real)
      return true
    }
    return (await shell.openPath(real)) === ''
  } catch {
    return false
  }
}
