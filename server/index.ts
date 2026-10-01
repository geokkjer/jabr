import express from 'express'
import cors from 'cors'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PORT,
  NODE_ENV,
  DB_PATH,
  getBooksDir,
} from './config.js'
import { getDb, closeDb } from './db.js'
import { healthRouter } from './routes/health.js'
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

// Serve static files in production
if (NODE_ENV === 'production') {
  const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist')
  app.use(express.static(distDir))
  app.use((_req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })
}

// Start server
if (NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`JABR server running on port ${PORT}`)
    console.log(`Books directory: ${getBooksDir()}`)
    console.log(`Database: ${DB_PATH}`)
  })

  // Kubernetes sends SIGTERM before killing the pod (and Ctrl-C sends SIGINT):
  // stop accepting connections, let in-flight requests drain, close SQLite
  // cleanly, then exit. Without this the process dies mid-write.
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`${signal} received — shutting down`)
    server.close(() => {
      closeDb()
      process.exit(0)
    })
    // Keep-alive connections would otherwise hold the server open
    server.closeIdleConnections()
    setTimeout(() => {
      console.warn('Shutdown timed out — forcing exit')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

export { app }
