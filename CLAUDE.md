# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server at http://localhost:3000 (default Vite port 5173 unless overridden)
npm run build      # production build → dist/
npm run preview    # serve the dist/ build locally
```

There are no tests or linter configured.

## Architecture

Everything lives in `src/App.jsx` — a single React component file (~320 lines). There is no routing, no state management library, no separate CSS modules.

### Tile data model

Game state is a **flat array of tile objects** (not a 2D grid):
```js
{ id, value, row, col, state: 'idle'|'new'|'merged', mk: number }
```
- `id`: stable identity across moves — used as the React `key` on the outer `<div>` so the element persists and its CSS transition plays
- `state`: drives animation class on the inner `<div>`
- `mk` (merge key): incremented on each merge; used as `key` on the **inner** `<div>` to force a remount and replay the CSS animation

### Two-div tile rendering

Each tile renders as two nested divs:
- **Outer div** — handles position via `transform: translate(x, y)` with a CSS `transition`. Keyed by `tile.id` so it persists across renders and slides smoothly.
- **Inner div** — handles scale animations (`tile-appear`, `tile-merge`). Keyed by `tile.mk` so it remounts on merge to replay the keyframe. Animations are defined in `src/index.css`.

This separation prevents the position transition and the scale animation from conflicting on the same `transform` property.

### Move sequence (two-phase)

`computeMove(tiles, dir)` returns `updates` — a flat list of `{id, toRow, toCol, isWinner?, isLoser?, nv?}`. It works by reading each row/column as a line in the target direction, calling `processLine()` which slides toward index 0, then mapping destinations back to (row, col).

**Phase 1** (`setTiles` immediately): move all tiles to new positions → CSS transition plays  
**Phase 2** (`setTimeout` after `SLIDE_MS + 16ms`): remove loser tiles, update winner values, spawn new tile

The Phase 2 callback captures `tiles` from the closure (pre-move snapshot) and recomputes final state from scratch — it does not read React state — to avoid stale closure issues.

### Storage

Uses `window.storage` (async get/set API), polyfilled in `src/main.jsx` as a thin wrapper over `localStorage`. Keys: `2048_hs` (JSON array of top-10 scores) and `2048_bs` (best score string). All calls are wrapped in try/catch.

### Module-level mutable state

`let _id = 1` is a module-level counter for tile IDs. It is never reset between games (IDs only need to be unique, not sequential from 1). `initTiles()` is called as the `useState` initializer and also directly in `startNewGame`.
