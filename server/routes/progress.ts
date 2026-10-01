import { Router } from 'express'
import type { Request, Response } from 'express'
import { getBookProgress, listRecentProgress, upsertBookProgress } from '../db.js'

export const progressRouter = Router()

// GET /api/progress?profileId=... — recent progress for "currently reading"
progressRouter.get('/', (req: Request, res: Response) => {
  try {
    const profileId = req.query.profileId as string
    if (!profileId) {
      res.status(400).json({ error: 'Missing profileId' })
      return
    }
    res.json(listRecentProgress(profileId, 20))
  } catch (e) {
    console.error('Failed to list progress:', e)
    res.status(500).json({ error: 'Failed to list progress' })
  }
})

progressRouter.get('/:bookId', (req: Request, res: Response) => {
  try {
    const bookId = req.params.bookId as string
    const profileId = req.query.profileId as string
    if (!profileId) {
      res.status(400).json({ error: 'Missing profileId' })
      return
    }
    const progress = getBookProgress(profileId, bookId)
    if (!progress) {
      res.status(404).json({ error: 'Progress not found' })
      return
    }
    res.json(progress)
  } catch (e) {
    console.error('Failed to get progress:', e)
    res.status(500).json({ error: 'Failed to get progress' })
  }
})

progressRouter.put('/:bookId', (req: Request, res: Response) => {
  try {
    const bookId = req.params.bookId as string
    const { profileId, format, location, percent } = req.body
    if (!profileId) {
      res.status(400).json({ error: 'Missing profileId' })
      return
    }
    upsertBookProgress({
      profileId,
      bookId,
      format: format || 'unknown',
      locationJson: JSON.stringify(location || null),
      percent: percent ?? null,
    })
    res.json({ ok: true })
  } catch (e) {
    console.error('Failed to save progress:', e)
    res.status(500).json({ error: 'Failed to save progress' })
  }
})
