import { Router } from 'express'
import type { Request, Response } from 'express'
import { listProfiles, createProfile } from '../db.js'

export const profilesRouter = Router()

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
