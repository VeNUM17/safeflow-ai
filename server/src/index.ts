import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import apiRouter from './routes/api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded documents statically
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// API Routes
app.use('/api', apiRouter);

// Serve frontend in production
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
app.use(express.static(CLIENT_DIST));

// Fallback SPA middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(CLIENT_DIST, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send('PSI Identification Engine API is running. Client build in progress.');
    }
  });
});

// Central Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Avoid leaking secret keys or uploaded document contents in logs
  console.error(`[API Error] ${req.method} ${req.path}: ${err.message || 'Internal Server Error'}`);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'An unexpected server error occurred',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[PSI Engine Server] Running on http://localhost:${PORT}`);
  console.log(`[PSI Engine Server] OSHA 29 CFR 1910.119(d)(1) Evidence Management Engine Ready`);
});

export default app;
