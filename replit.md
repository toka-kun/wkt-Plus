# wkt-Plus (わかめtube Plus)

Self-hostable YouTube alternative frontend built with Node.js, Express, and EJS.

## Stack
- **Runtime**: Node.js 20
- **Framework**: Express
- **Templating**: EJS
- **YouTube API**: youtubei.js (Innertube), ytpl
- **Styling**: Tailwind CSS (CDN)
- **Language/Locale**: ja, JP

## Architecture

### Entry Point
- `server.js` — Express app setup, Innertube client initialization, route mounting

### Routes / Controllers
| Path | File |
|------|------|
| `/wkt/yt/watch/:id` | `controllers/tube/getvideo.js` |
| `/wkt/yt/edu/:id` | `controllers/tube/youtube.js` |
| `/wkt/yt/nocookie/:id` | `controllers/tube/youtube.js` |

### Server Helpers
- `server/youtube.js` — Innertube wrappers: `infoGet`, `search`, `getComments`, `getChannel`, `normalizeWatchNextFeed`, `extractChannels`
- `server/wakame.js` — Video stream URL fetching from external API servers

### Views
- `views/tube/watch.ejs` — Main watch page
- `views/tube/umekomi/edu.ejs` — YouTube Education embed page
- `views/tube/umekomi/nocookie.ejs` — YouTube nocookie embed page
- `views/tube/trend.ejs` — Trending videos (reference card structure)
- `views/tube/search.ejs` — Search results

## Key Features

### Multi-channel (Collab) Support
`server/youtube.js::extractChannels(Info)` builds a `channels` array:
- Index 0: primary channel from `secondary_info.owner.author`
- Additional entries: any channels found in `secondary_info.metadata.rows` with browse IDs starting with `UC`

All three watch pages (watch/edu/nocookie) pass `videoInfo.channels` to their EJS templates. Templates render a single channel row when `channels.length === 1`, or a bullet list of linked channel names when `channels.length > 1`.

### Auto-server Cache Selection (watch page)
`getvideo.js` checks multiple streaming API server caches (siawaseok → yudlp → ytdlpinstance-vercel → senninytdlp → invidious) before fetching video stream data.

### `normalizeWatchNextFeed`
Expands `CompactAutoplay` wrappers and converts `LockupView` (new YouTube format) to `CompactVideo`-compatible objects for the sidebar feed.

## Video Card Structure (all pages)
Cards follow the trend page reference structure:
- `rounded-lg shadow hover:bg-gray-700`
- Thumbnail: `block relative group` link with `absolute bottom-1 right-1` duration badge
- Channel icon: `flex-shrink-0` `<a>` with circular avatar
- Content: `flex-1 min-w-0` div with `text-sm leading-snug line-clamp-2` title

## Z-index Layering (watch pages)
- `controlPanel` → `z-50`
- `commentBox` / `dougaBox` → `z-40`
- `dougaBox` sticky header → `z-10 bg-gray-800 pb-2`
