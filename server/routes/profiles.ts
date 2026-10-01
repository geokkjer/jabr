import { Router } from 'express'
import type { Request, Response } from 'express'
import { listProfiles, createProfile, renameProfile } from '../db.js'

export const profilesRouter = Router()

/** The profile a fresh install starts with, so reading works immediately. */
export const DEFAULT_PROFILE_NAME = 'Me'

profilesRouter.get('/', (_req: Request, res: Response) => {
  try {
    res.json(listProfiles())
  } catch (e) {
    console.error('Failed to list profiles:', e)
    res.status(500).json({ error: 'Failed to list profiles' })
  }
})

profilesRouter.post('/', (req: Request, res: Response) => {
  try {
    const { name } = req.body
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Missing name' })
      return
    }
    const profile = createProfile(name.trim())
    res.json(profile)
  } catch (e) {
    console.error('Failed to create profile:', e)
    res.status(500).json({ error: 'Failed to create profile' })
  }
})

// POST /api/profiles/default — create the starter profile if the install has
// none, and return the list either way. Idempotent, so clients can call it on
// every load without racing each other into duplicate profiles.
profilesRouter.post('/default', (_req: Request, res: Response) => {
  try {
    if (listProfiles().length === 0) {
      createProfile(DEFAULT_PROFILE_NAME)
    }
    res.json(listProfiles())
  } catch (e) {
    console.error('Failed to ensure default profile:', e)
    res.status(500).json({ error: 'Failed to ensure default profile' })
  }
})

profilesRouter.patch('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { name } = req.body
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Missing name' })
      return
    }
    const profile = renameProfile(id, name.trim())
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' })
      return
    }
    res.json(profile)
  } catch (e) {
    console.error('Failed to rename profile:', e)
    res.status(500).json({ error: 'Failed to rename profile' })
  }
})
