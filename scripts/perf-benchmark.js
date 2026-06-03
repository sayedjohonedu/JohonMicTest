const { app, clipboard, nativeImage } = require('electron');
const DB = require('better-sqlite3');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  console.log("--- Performance Benchmark ---");

  // 1. Clipboard Monitor Polling Benchmark
  const monitorStart = Date.now();
  for (let i = 0; i < 200; i++) {
    clipboard.readImage();
  }
  const monitorEnd = Date.now();
  console.log(`[Baseline] 200 clipboard.readImage() calls took: ${monitorEnd - monitorStart} ms`);

  const optimizedMonitorStart = Date.now();
  for (let i = 0; i < 200; i++) {
    const formats = clipboard.availableFormats();
    const hasImage = formats.some(f => f.startsWith('image/'));
    if (hasImage) {
      clipboard.readImage();
    }
  }
  const optimizedMonitorEnd = Date.now();
  console.log(`[Optimized] 200 availableFormats() calls took: ${optimizedMonitorEnd - optimizedMonitorStart} ms`);

  // 2. Database Query Benchmark
  console.log("\nSetting up DB with large text entries...");
  const db = new DB('./test-clipboard.sqlite');
  db.exec('DROP TABLE IF EXISTS entries');
  db.exec(`
    CREATE TABLE entries (
      id TEXT PRIMARY KEY, timestamp INTEGER, type TEXT, text TEXT, imagePath TEXT,
      isFavorite INTEGER, isPinned INTEGER, categories TEXT, userCategories TEXT, copyCount INTEGER, byteSize INTEGER, isDeleted INTEGER DEFAULT 0
    );
  `);

  const insert = db.prepare(`INSERT INTO entries (id, timestamp, type, text, categories, userCategories) VALUES (?, ?, 'text', ?, '[]', '[]')`);

  const largeText = "A".repeat(2 * 1024 * 1024); // 2 MB text

  db.transaction(() => {
    for (let i = 0; i < 50; i++) {
      insert.run(`test-${i}`, Date.now() - i, largeText);
    }
  })();

  console.log("DB setup complete (50 entries, 2MB each)");

  const queryStart = Date.now();
  const rows = db.prepare('SELECT * FROM entries ORDER BY timestamp DESC LIMIT 50').all();
  const queryEnd = Date.now();

  let totalLength = 0;
  for (const e of rows) totalLength += (e.text ? e.text.length : 0);

  console.log(`[Baseline] DB Query (SELECT *) took: ${queryEnd - queryStart} ms`);
  console.log(`[Baseline] Total text length fetched: ${(totalLength / 1024 / 1024).toFixed(2)} MB`);

  const optQueryStart = Date.now();
  const optRows = db.prepare('SELECT id, timestamp, type, substr(text, 1, 3000) as text, imagePath, isFavorite, isPinned, categories, userCategories, copyCount, byteSize, isDeleted FROM entries ORDER BY timestamp DESC LIMIT 50').all();
  const optQueryEnd = Date.now();

  let optTotalLength = 0;
  for (const e of optRows) optTotalLength += (e.text ? e.text.length : 0);

  console.log(`[Optimized] DB Query with substr(text, 1, 3000) took: ${optQueryEnd - optQueryStart} ms`);
  console.log(`[Optimized] Total text length fetched: ${(optTotalLength / 1024 / 1024).toFixed(2)} MB`);

  app.quit();
});
