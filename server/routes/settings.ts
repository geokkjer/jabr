import { Router } from 'express'
import { existsSync } from 'node:fs'
import type { Request, Response } from 'express'
import {
  getSetting,
  setSetting,
  listProfiles,
  listAllProgress,
  resetDatabase,
} from '../db.js'
import { migrateFromCalibre } from '../migrate.js'
import { invalidateScanCache, scanAndIndex } from '../scanner.js'

export const settingsRouter = Router()

settingsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const keys = ['libraryPath', 'readerTarget', 'calibreMigrated', 'calibreLibraryPath']
    const settings: Record<string, string | null> = {}
    for (const key of keys) {
      settings[key] = getSetting(key)
    }
    res.json(settings)
  } catch (e) {
    console.error('Failed to get settings:', e)
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

settingsRouter.post('/', (req: Request, res: Response) => {
  try {
    const settings = req.body
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && value !== null) {
        setSetting(key, String(value))
      }
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to save settings:', e)
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

settingsRouter.delete('/', (_req: Request, res: Response) => {
  try {
    resetDatabase()
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to reset database:', e)
    res.status(500).json({ error: 'Failed to reset database' })
  }
})

settingsRouter.post('/migrate', async (req: Request, res: Response) => {
  try {
    const { libraryPath, preferFormat, dryRun } = req.body
    if (!libraryPath || typeof libraryPath !== 'string') {
      res.status(400).json({ error: 'Missing libraryPath' })
      return
    }
    if (!existsSync(libraryPath)) {
      res.status(400).json({ error: 'Library path does not exist' })
      return
    }

    const result = await migrateFromCalibre(libraryPath, {
      preferFormat: preferFormat as string | undefined,
      dryRun: dryRun === true,
    })

    if (!dryRun) {
      setSetting('calibreMigrated', 'true')
      setSetting('calibreLibraryPath', libraryPath)
      invalidateScanCache()
      await scanAndIndex()
    }

    res.json(result)
  } catch (e) {
    console.error('Failed to migrate:', e)
    res.status(500).json({ error: e instanceof Error ? e.message : 'Migration failed' })
  }
})

settingsRouter.get('/export', async (_req: Request, res: Response) => {
  try {
    const profiles = listProfiles()
    const progress = listAllProgress(10000)
    const settings: Record<string, string | null> = {}
    const keys = ['libraryPath', 'readerTarget', 'calibreMigrated', 'calibreLibraryPath']
    for (const key of keys) {
      settings[key] = getSetting(key)
    }

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings,
      profiles,
      progress,
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="jabr-backup.json"')
    res.json(backup)
  } catch (e) {
    console.error('Failed to export:', e)
    res.status(500).json({ error: 'Failed to export' })
  }
})
