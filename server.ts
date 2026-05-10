import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Google OAuth configuration - lazy initialization to avoid crashing if keys are missing
  const getOAuth2Client = (redirectUri?: string) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || "424136190511-47nk7q6nnq44gg34irglbmo64rdhnjmi.apps.googleusercontent.com";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "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";

    if (!clientId || !clientSecret || clientId === "MY_GOOGLE_CLIENT_ID") {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in environment variables.");
    }

    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri || `${process.env.APP_URL}/auth/callback`
    );
  };

  // API Routes
  app.get("/api/auth/google/url", (req, res) => {
    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      const origin = process.env.APP_URL || `${protocol}://${host}`;
      const redirectUri = `${origin}/auth/callback`;

      const oauth2Client = getOAuth2Client(redirectUri);

      const scopes = [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/analytics.readonly",
      ];

      const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent",
      });

      res.json({ url });
    } catch (error: any) {
      console.error("Failed to generate auth URL:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      const origin = process.env.APP_URL || `${protocol}://${host}`;
      const redirectUri = `${origin}/auth/callback`;

      const oauth2Client = getOAuth2Client(redirectUri);
      const { tokens } = await oauth2Client.getToken(code as string);
      // In a real app, we'd store these in a DB linked to the user.
      // For this demo, we'll send a message to the client.
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Auth error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Proxy requests for GSC/GA
  app.post("/api/integrations/query", async (req, res) => {
    const { tokens, type, siteUrl, propertyId } = req.body;
    if (!tokens) return res.status(401).json({ error: "Missing tokens" });

    try {
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials(tokens);

      if (type === "gsc") {
        const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });
        const result = await searchconsole.searchanalytics.query({
          siteUrl,
          requestBody: {
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            endDate: new Date().toISOString().split("T")[0],
            dimensions: ["query"],
            rowLimit: 10,
          },
        });
        res.json(result.data);
      } else if (type === "ga") {
          // Note: GA4 uses Analytics Data API
          const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });
          const result = await analyticsData.properties.runReport({
            property: `properties/${propertyId}`,
            requestBody: {
              dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
              dimensions: [{ name: 'pageTitle' }],
              metrics: [{ name: 'activeUsers' }],
            },
          });
          res.json(result.data);
      }
    } catch (error: any) {
      console.error(`${type} query error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
