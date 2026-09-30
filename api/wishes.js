// Shared wish wall for "Paint a wish on the back door".
// Storage: Upstash Redis. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// in the Vercel project environment (Production and any Preview deployments).
import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

const redis = Redis.fromEnv({ automaticDeserialization: false });

const KEY = 'bday:wishes';     // newest wish first
const MAX_LEN = 70;            // characters per wish
const MAX_STORED = 5000;       // oldest wishes beyond this are dropped
const RATE_LIMIT = 5;          // wishes per visitor...
const RATE_WINDOW = 600;       // ...per 10 minutes

const clean = (t) => String(t ?? '').replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E]/g, ' ').replace(/\s+/g, ' ').trim();
const parse = (raw) => { try { const w = typeof raw === 'string' ? JSON.parse(raw) : raw; return w && w.id && w.text ? { id: w.id, text: w.text, ts: w.ts } : null; } catch { return null; } };
const visitor = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'anon';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const [total, items] = await Promise.all([redis.llen(KEY), redis.lrange(KEY, offset, offset + limit - 1)]);
      return res.status(200).json({ total: Number(total) || 0, offset, wishes: items.map(parse).filter(Boolean) });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const text = clean(body?.text);
      if (!text) return res.status(400).json({ error: 'Write a wish before painting it.' });
      if ([...text].length > MAX_LEN) return res.status(400).json({ error: `Keep it under ${MAX_LEN} characters.` });

      const rateKey = `bday:rate:${visitor(req)}`;
      const count = Number(await redis.incr(rateKey));
      if (count === 1) await redis.expire(rateKey, RATE_WINDOW);
      if (count > RATE_LIMIT) return res.status(429).json({ error: 'That is a lot of wishes! Try again in a few minutes.' });

      const wish = { id: randomUUID(), text, ts: Date.now() };
      await redis.lpush(KEY, JSON.stringify(wish));
      await redis.ltrim(KEY, 0, MAX_STORED - 1);
      const total = Number(await redis.llen(KEY)) || 0;
      return res.status(201).json({ wish, total });
    }

    if (req.method === 'DELETE') {
      // Moderation: DELETE /api/wishes?id=<wish id>  with header  x-admin-token: <ADMIN_TOKEN>
      const token = req.headers['x-admin-token'];
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Not allowed.' });
      const id = String(req.query.id || '');
      const items = await redis.lrange(KEY, 0, -1);
      const raw = items.find((r) => parse(r)?.id === id);
      if (!raw) return res.status(404).json({ error: 'No wish with that id.' });
      await redis.lrem(KEY, 1, raw);
      return res.status(200).json({ removed: id });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('wishes api error', err);
    return res.status(500).json({ error: 'The wish wall is having a moment. Try again shortly.' });
  }
}
