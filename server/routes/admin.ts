import { Router } from 'express'
import type { Request, Response } from 'express'
import { listProfiles, listAllProgress, resetDatabase } from '../db.js'

export const adminRouter = Router()

// GET /api/admin/export — download a JSON backup of profiles and progress
adminRouter.get('/export', async (_req: Request, res: Response) => {
  try {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      profiles: listProfiles(),
      progress: listAllProgress(10000),
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="jabr-backup.json"')
    res.json(backup)
  } catch (e) {
    console.error('Failed to export:', e)
    res.status(500).json({ error: 'Failed to export' })
  }
})

// DELETE /api/admin/data — wipe profiles, progress and the book index
adminRouter.delete('/data', (_req: Request, res: Response) => {
  try {
    resetDatabase()
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to reset database:', e)
    res.status(500).json({ error: 'Failed to reset database' })
  }
})
