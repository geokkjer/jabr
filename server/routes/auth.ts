import { Router } from 'express'
import type { Request, Response } from 'express'
import { getSetting } from '../db.js'
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_SECONDS } from '../config.js'

export const authRouter = Router()

authRouter.post('/', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body
    const authEnabled = getSetting('authEnabled') === 'true'

    if (!authEnabled) {
      res.json({ ok: true })
      return
    }

    const expectedUser = getSetting('username') || 'admin'
    const storedPassword = getSetting('password')

    if (username !== expectedUser) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    if (!storedPassword) {
      if (password === 'admin') {
        res.cookie(AUTH_COOKIE_NAME, 'authenticated', {
          maxAge: AUTH_COOKIE_MAX_AGE_SECONDS * 1000,
          httpOnly: true,
          sameSite: 'strict',
        })
        res.json({ ok: true })
        return
      }
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    if (password === storedPassword) {
      res.cookie(AUTH_COOKIE_NAME, 'authenticated', {
        maxAge: AUTH_COOKIE_MAX_AGE_SECONDS * 1000,
        httpOnly: true,
        sameSite: 'strict',
      })
      res.json({ ok: true })
      return
    }

    res.status(401).json({ error: 'Invalid credentials' })
  } catch (e) {
    console.error('Failed to login:', e)
    res.status(500).json({ error: 'Failed to login' })
  }
})

authRouter.delete('/', (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME)
  res.json({ ok: true })
})

authRouter.get('/status', (_req: Request, res: Response) => {
  const authEnabled = getSetting('authEnabled') === 'true'
  res.json({ authEnabled })
})
