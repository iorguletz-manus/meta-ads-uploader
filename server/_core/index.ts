import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadBufferToBunny } from "../bunnyStorage";
import multer from "multer";

// Configure multer for large file uploads (500MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

const META_API_BASE = "https://graph.facebook.com/v24.0";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Large video upload endpoint - uploads to Bunny then Meta
  app.post('/api/upload-video', upload.single('video'), async (req, res) => {
    try {
      console.log('[upload-video] ====== START ======');
      const { accessToken, adAccountId, fileName } = req.body;
      const file = req.file;
      
      if (!file) {
        console.error('[upload-video] No file provided');
        return res.status(400).json({ error: 'No video file provided' });
      }
      
      if (!accessToken || !adAccountId) {
        console.error('[upload-video] Missing accessToken or adAccountId');
        return res.status(400).json({ error: 'Missing accessToken or adAccountId' });
      }
      
      console.log(`[upload-video] File: ${fileName || file.originalname}`);
      console.log(`[upload-video] Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[upload-video] MimeType: ${file.mimetype}`);
      
      // Step 1: Upload to Bunny
      console.log('[upload-video] Step 1: Uploading to Bunny...');
      const bunnyResult = await uploadBufferToBunny(
        fileName || file.originalname,
        file.buffer,
        file.mimetype,
        'uploads'
      );
      
      if (!bunnyResult.success || !bunnyResult.cdnUrl) {
        console.error('[upload-video] Bunny upload failed:', bunnyResult.error);
        return res.status(500).json({ error: `Bunny upload failed: ${bunnyResult.error}` });
      }
      
      console.log(`[upload-video] Bunny URL: ${bunnyResult.cdnUrl}`);
      
      // Step 2: Upload to Meta using file_url
      console.log('[upload-video] Step 2: Uploading to Meta via file_url...');
      const cleanAdAccountId = adAccountId.replace('act_', '');
      
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('file_url', bunnyResult.cdnUrl);
      formData.append('title', fileName || file.originalname);
      
      const metaResponse = await fetch(
        `${META_API_BASE}/act_${cleanAdAccountId}/advideos`,
        {
          method: 'POST',
          body: formData,
        }
      );
      
      const metaData = await metaResponse.json();
      
      if (metaData.error) {
        console.error('[upload-video] Meta API error:', metaData.error);
        return res.status(500).json({ error: metaData.error.message || 'Meta upload failed' });
      }
      
      console.log('[upload-video] ====== SUCCESS ======');
      console.log(`[upload-video] Video ID: ${metaData.id}`);
      
      return res.json({
        success: true,
        videoId: metaData.id,
        bunnyUrl: bunnyResult.cdnUrl,
        fileName: fileName || file.originalname,
        type: 'video'
      });
      
    } catch (error: any) {
      console.error('[upload-video] Error:', error.message);
      return res.status(500).json({ error: error.message || 'Upload failed' });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
