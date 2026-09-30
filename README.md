# Happy Birthday Yasso Ji — Vercel deploy

```
index.html        illustrated pages, truck navigation, audio, photos, countdown
cake.js           timed cake celebration and pointer / keyboard interactions
cake.css          3D cake, celebration layout, and global nimboo mirchi
api/wishes.js     shared wish wall API (GET list, POST add, DELETE for moderation)
package.json      one dependency: @upstash/redis
```

## Deploy

1. Push this folder to a GitHub repo and import it in Vercel (Framework preset: **Other**, no build command).
2. Connect an **Upstash Redis** database to the project through the Vercel Marketplace.
3. In the project's environment variables, confirm these exact names exist for **Production** (and **Preview** if testing preview deployments):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   Use the REST URL and read/write token from that database. The API uses `Redis.fromEnv()`, which reads these names. If an integration supplies only `KV_REST_API_URL` / `KV_REST_API_TOKEN`, add the equivalent `UPSTASH_` variables with those values.
4. Optional, for removing bad wishes: add an environment variable `ADMIN_TOKEN` with a long secret.
5. Deploy or redeploy after saving the database variables.
6. Open `/api/wishes?limit=1` on your deployed domain. A healthy read returns HTTP 200 and JSON containing `total`, `offset`, and `wishes`. Then add a real wish and check from another browser to verify shared writes.

The local Python preview serves static files only, so `/api/wishes` returns 404 there and wishes stay in that browser. Vercel runs `api/wishes.js` as a function and installs the dependency in `package.json`; a connected database is still required.

References: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [Upstash connection settings](https://upstash.com/docs/redis/howto/connect-with-upstash-redis).

## How the wall works

- Newest wishes come first. The page shows the first 10; **See N more wishes** loads the rest.
- Each wish: max 70 characters. Each visitor can paint 5 wishes per 10 minutes.
- Up to 5,000 wishes are kept (oldest dropped after that).
- There is no "delete my wishes" button; remove wishes with the admin token below.
- If `/api/wishes` isn't reachable (e.g. the Claude preview), the wall falls back to saving wishes only on that device.

## Removing a wish

Find its `id` from `https://YOUR-SITE.vercel.app/api/wishes?limit=200`, then:

```
curl -X DELETE "https://YOUR-SITE.vercel.app/api/wishes?id=WISH_ID" -H "x-admin-token: YOUR_ADMIN_TOKEN"
```

## Birthday cake and party effects

- The photos and cake are locked until **1 October 2026, 12:00 AM Asia/Kolkata** (30 September, 18:30 UTC), and remain available on later dates. Both use the shared `BIRTHDAY_UNLOCK_AT` instant. An open page unlocks automatically; no refresh is needed. The gate uses the visitor’s device clock. Photo thumbnails and their viewer are unavailable before midnight; the polaroids have no numbered “Yaadein” captions.
- Choose **Cut the cake with Yashi**, blow out seven candles, then drag each candle away. Tapping a blown-out candle or activating it with the keyboard also removes it. Candles become removable after all seven flames are out.
- Once the candles are removed, the view rotates overhead and a knife appears. Drag the knife through the centre or choose **Cut a slice**. **Celebrate again** resets the cake. Reduced-motion settings skip the camera and cutting animations.
- Opening the birthday greeting plays a confetti pop. The greeting also has a **Throw confetti** button; browser sound starts from the visitor’s navigation or button gesture.
- The existing vector nimboo mirchi hangs at the top right throughout the site.

For a local preview, serve this directory with `python3 -m http.server 4173` and open `http://localhost:4173`. Deploy all three front-end files together.

## Candle interaction checks

Run `node --test tests/candle-drag.test.cjs` for the dependency-free drag regression checks. These cover screen-coordinate movement, mouse/touch/pen gestures, short drags, cancelled/lost capture, fast release, keyboard fallback, and duplicate click prevention. The drag preview is drawn above the page so the cake’s 3D perspective cannot offset or hide it.

## Record playback

Records repeat continuously using a looping audio buffer, including while navigating between pages. Confetti, firecrackers, and candle puffs leave the music playing. Starting another record or the birthday horn song replaces the previous music; the existing stop/needle controls still work. The active vinyl rotates clockwise around its own centre in the picker and on the gramophone, with reduced-motion preferences respected.

Run `node --test tests/music-playback.test.cjs` to check looping, music replacement, manual stop, asynchronous selection races, and render-error recovery.
