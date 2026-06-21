import express from 'express'
import cors from 'cors'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PORT,
  NODE_ENV,
  getBooksDir,
} from './config.js'
import { getDb } from './db.js'
import { healthRouter } from './routes/health.js'
import { authRouter } from './routes/auth.js'
import { profilesRouter } from './routes/profiles.js'
import { progressRouter } from './routes/progress.js'
import { settingsRouter } from './routes/settings.js'
import { booksRouter, bookFileRouter } from './routes/books.js'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Ensure DB is initialized
getDb()

// Routes
app.use('/api/health', healthRouter)
app.use('/api/books', booksRouter)
app.use('/api/book', bookFileRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/progress', progressRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/login', authRouter)

// Serve static files in production
if (NODE_ENV === 'production') {
  const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist')
  app.use(express.static(distDir))
  app.use((_req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })
}

// Start server
app.listen(PORT, () => {
  console.log(`JABR server running on port ${PORT}`)
  console.log(`Books directory: ${getBooksDir()}`)
  console.log(`Database: ${resolve(process.cwd(), 'data', 'jabr.sqlite3')}`)
})
