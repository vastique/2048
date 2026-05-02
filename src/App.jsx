import React, { useState, useEffect, useCallback, useRef } from 'react';

const TILE_SIZE = 80;
const GAP = 12;
const SLIDE_MS = 110; // slide transition duration

// ─── Tile colors ───────────────────────────────────────────────────────────────
const TILE_COLORS = {
  2:    { bg: '#eee4da', fg: '#776e65' },
  4:    { bg: '#ede0c8', fg: '#776e65' },
  8:    { bg: '#f2b179', fg: '#f9f6f2' },
  16:   { bg: '#f59563', fg: '#f9f6f2' },
  32:   { bg: '#f67c5f', fg: '#f9f6f2' },
  64:   { bg: '#f65e3b', fg: '#f9f6f2' },
  128:  { bg: '#edcf72', fg: '#f9f6f2' },
  256:  { bg: '#edcc61', fg: '#f9f6f2' },
  512:  { bg: '#edc850', fg: '#f9f6f2' },
  1024: { bg: '#edc53f', fg: '#f9f6f2' },
  2048: { bg: '#edc22e', fg: '#f9f6f2' },
};
function tileColors(v) { return TILE_COLORS[v] ?? { bg: '#3c3a32', fg: '#f9f6f2' }; }

// Pixel position for a tile at (row, col)
function tileXY(row, col) {
  return [col * (TILE_SIZE + GAP), row * (TILE_SIZE + GAP)];
}

// ─── Game logic ────────────────────────────────────────────────────────────────

// Slide a line toward index 0; returns { moves, merges, score }
// Each item in line is a tile object or null.
function processLine(line) {
  const present = line.filter(Boolean);
  const moves = [], merges = [];
  let score = 0, dest = 0, i = 0;
  while (i < present.length) {
    if (i + 1 < present.length && present[i].value === present[i + 1].value) {
      const nv = present[i].value * 2;
      merges.push({ winner: present[i], loser: present[i + 1], dest, nv });
      score += nv;
      dest++;
      i += 2;
    } else {
      moves.push({ tile: present[i], dest: dest++ });
      i++;
    }
  }
  return { moves, merges, score };
}

// Compute all tile updates for a direction.
// Returns: { updates: [{id, toRow, toCol, isWinner?, isLoser?, nv?}], totalScore, moved }
function computeMove(tiles, dir) {
  const grid = Array(4).fill(null).map(() => Array(4).fill(null));
  for (const t of tiles) grid[t.row][t.col] = t;

  const updates = [];
  let totalScore = 0;

  for (let i = 0; i < 4; i++) {
    let line, toPos;
    if (dir === 'left')  { line = [0,1,2,3].map(c => grid[i][c]); toPos = d => [i, d]; }
    if (dir === 'right') { line = [3,2,1,0].map(c => grid[i][c]); toPos = d => [i, 3-d]; }
    if (dir === 'up')    { line = [0,1,2,3].map(r => grid[r][i]); toPos = d => [d, i]; }
    if (dir === 'down')  { line = [3,2,1,0].map(r => grid[r][i]); toPos = d => [3-d, i]; }

    const { moves, merges, score } = processLine(line);
    totalScore += score;

    for (const { tile, dest } of moves) {
      const [r, c] = toPos(dest);
      updates.push({ id: tile.id, toRow: r, toCol: c });
    }
    for (const { winner, loser, dest, nv } of merges) {
      const [r, c] = toPos(dest);
      updates.push({ id: winner.id, toRow: r, toCol: c, isWinner: true, nv });
      updates.push({ id: loser.id,  toRow: r, toCol: c, isLoser: true });
    }
  }

  // A move happened if any tile changed position or any merge occurred
  const moved = updates.some(u => {
    if (u.isWinner || u.isLoser) return true;
    const t = tiles.find(t => t.id === u.id);
    return t && (t.row !== u.toRow || t.col !== u.toCol);
  });

  return { updates, totalScore, moved };
}

function isGameOver(tiles) {
  if (tiles.length < 16) return false;
  const g = Array(4).fill(null).map(() => Array(4).fill(0));
  for (const t of tiles) g[t.row][t.col] = t.value;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (c < 3 && g[r][c] === g[r][c+1]) return false;
      if (r < 3 && g[r][c] === g[r+1][c]) return false;
    }
  return true;
}

// ─── Tile factory ──────────────────────────────────────────────────────────────
let _id = 1;
function mkTile(row, col) {
  return { id: _id++, value: Math.random() < 0.9 ? 2 : 4, row, col, state: 'new', mk: 0 };
}
function spawnTile(tiles) {
  const occ = new Set(tiles.map(t => `${t.row},${t.col}`));
  const empty = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (!occ.has(`${r},${c}`)) empty.push([r, c]);
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  return mkTile(r, c);
}
function initTiles() {
  const t1 = spawnTile([]);
  const t2 = spawnTile([t1]);
  return [t1, t2];
}

// ─── Storage ───────────────────────────────────────────────────────────────────
async function loadHS() {
  try { return JSON.parse(await window.storage.get('2048_hs')) ?? []; } catch { return []; }
}
async function saveHS(s) {
  try { await window.storage.set('2048_hs', JSON.stringify(s)); } catch {}
}
async function loadBS() {
  try { return parseInt(await window.storage.get('2048_bs'), 10) || 0; } catch { return 0; }
}
async function saveBS(s) {
  try { await window.storage.set('2048_bs', String(s)); } catch {}
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tiles, setTiles] = useState(initTiles);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [animating, setAnimating] = useState(false);

  const [highScores, setHighScores] = useState([]);
  const [showHighScores, setShowHighScores] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [newHighScore, setNewHighScore] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const scoreRef = useRef(0);
  const touchStart = useRef(null);

  useEffect(() => {
    (async () => {
      const [hs, bs] = await Promise.all([loadHS(), loadBS()]);
      setHighScores(hs);
      setBestScore(bs);
    })();
  }, []);

  // ── New game ─────────────────────────────────────────────────────────────────
  const startNewGame = useCallback(() => {
    setTiles(initTiles());
    setScore(0);
    scoreRef.current = 0;
    setGameOver(false);
    setWon(false);
    setKeepPlaying(false);
    setAnimating(false);
    setShowNameModal(false);
    setNewHighScore(false);
    setPendingScore(null);
  }, []);

  // ── End-of-game flow ─────────────────────────────────────────────────────────
  const handleGameEnd = useCallback(async (finalScore, finalTiles) => {
    const maxTile = Math.max(...finalTiles.map(t => t.value));
    const [bs, hs] = await Promise.all([loadBS(), loadHS()]);
    if (finalScore > bs) { await saveBS(finalScore); setBestScore(finalScore); }
    const qualifies = hs.length < 10 || finalScore > (hs[hs.length - 1]?.score ?? 0);
    if (qualifies && finalScore > 0) {
      setPendingScore({ score: finalScore, maxTile, date: new Date().toLocaleDateString() });
      setShowNameModal(true);
    }
  }, []);

  // ── Submit name ──────────────────────────────────────────────────────────────
  const submitHighScore = useCallback(async () => {
    if (!pendingScore) return;
    const name = playerName.trim() || 'Anonymous';
    const existing = await loadHS();
    const updated = [...existing, { name, ...pendingScore }]
      .sort((a, b) => b.score - a.score).slice(0, 10);
    await saveHS(updated);
    setHighScores(updated);
    setNewHighScore(true);
    setShowNameModal(false);
    setPlayerName('');
    setPendingScore(null);
    setTimeout(() => setNewHighScore(false), 3000);
  }, [pendingScore, playerName]);

  const clearHighScores = useCallback(async () => {
    await saveHS([]);
    setHighScores([]);
    setShowClearConfirm(false);
  }, []);

  // ── Core move handler ────────────────────────────────────────────────────────
  const makeMove = useCallback((dir) => {
    if (animating || showNameModal || gameOver) return;

    const { updates, totalScore, moved } = computeMove(tiles, dir);
    if (!moved) return;

    setAnimating(true);

    // Phase 1: slide all tiles to new positions (CSS transition handles the visual)
    setTiles(prev => prev.map(t => {
      const u = updates.find(u => u.id === t.id);
      return u ? { ...t, row: u.toRow, col: u.toCol, state: 'idle' } : t;
    }));

    // Phase 2: after the slide, resolve merges and spawn a new tile
    const losers  = new Set(updates.filter(u => u.isLoser).map(u => u.id));
    const winners = new Map(updates.filter(u => u.isWinner).map(u => [u.id, u]));

    setTimeout(() => {
      // Recompute from the pre-move closure snapshot so we don't rely on stale state
      const afterSlide = tiles.map(t => {
        const u = updates.find(u => u.id === t.id);
        return u ? { ...t, row: u.toRow, col: u.toCol } : t;
      });

      const afterMerge = afterSlide
        .filter(t => !losers.has(t.id))
        .map(t => {
          const w = winners.get(t.id);
          // Increment mk so the inner div remounts and replays the merge animation
          return w ? { ...t, value: w.nv, state: 'merged', mk: t.mk + 1 } : { ...t, state: 'idle' };
        });

      const spawned = spawnTile(afterMerge);
      const finalTiles = spawned ? [...afterMerge, spawned] : afterMerge;

      setTiles(finalTiles);

      const nextScore = scoreRef.current + totalScore;
      scoreRef.current = nextScore;
      setScore(nextScore);
      setBestScore(best => {
        if (nextScore > best) { saveBS(nextScore); return nextScore; }
        return best;
      });

      const maxVal = Math.max(...finalTiles.map(t => t.value));
      if (!won && !keepPlaying && maxVal >= 2048) setWon(true);

      if (isGameOver(finalTiles)) {
        setGameOver(true);
        handleGameEnd(nextScore, finalTiles);
      }

      setAnimating(false);
    }, SLIDE_MS + 16);

  }, [animating, showNameModal, gameOver, tiles, won, keepPlaying, handleGameEnd]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const KEYS = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down',
      A: 'left', D: 'right', W: 'up', S: 'down',
    };
    const handler = (e) => {
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      if (!showNameModal) makeMove(dir);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [makeMove, showNameModal]);

  // ── Touch / swipe ─────────────────────────────────────────────────────────────
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    makeMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  const boardSize = 4 * TILE_SIZE + 3 * GAP; // 356px
  const boardPad = 12;

  return (
    <div
      className="min-h-screen flex flex-col items-center py-6 px-4"
      style={{ background: '#faf8ef' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between mb-3">
        <h1 className="text-5xl font-extrabold" style={{ color: '#776e65', letterSpacing: '-2px' }}>2048</h1>
        <div className="flex gap-2">
          <ScoreBox label="SCORE" value={score} />
          <ScoreBox label="BEST"  value={bestScore} />
        </div>
      </div>

      {/* Controls row */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setShowInstructions(v => !v)}
            className="text-xs px-3 py-1 rounded font-semibold"
            style={{ background: '#8f7a66', color: '#f9f6f2' }}
          >
            How to play
          </button>
          <button
            onClick={() => setShowHighScores(v => !v)}
            className="text-xs px-3 py-1 rounded font-semibold relative"
            style={{ background: '#8f7a66', color: '#f9f6f2' }}
          >
            High Scores
            {newHighScore && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-yellow-400 border border-white" />
            )}
          </button>
        </div>
        <button
          onClick={startNewGame}
          className="text-xs px-3 py-1 rounded font-semibold"
          style={{ background: '#8f7a66', color: '#f9f6f2' }}
        >
          New Game
        </button>
      </div>

      {/* Instructions */}
      {showInstructions && (
        <div className="w-full max-w-md rounded-lg p-4 mb-4 text-sm" style={{ background: '#eee4da', color: '#776e65' }}>
          <p className="font-bold mb-1">How to play</p>
          <p>Use <strong>arrow keys</strong> or <strong>WASD</strong> to slide tiles. When two tiles with the same number touch, they <strong>merge</strong>!</p>
          <p className="mt-1">Reach the <strong>2048 tile</strong> to win. Keep going for a higher score!</p>
          <p className="mt-1 text-xs opacity-70">On mobile, swipe in any direction.</p>
        </div>
      )}

      {/* High Scores Panel */}
      {showHighScores && (
        <HighScoresPanel
          highScores={highScores}
          onClose={() => setShowHighScores(false)}
          onClear={() => setShowClearConfirm(true)}
        />
      )}

      {/* Game Board */}
      <div
        className="relative rounded-lg"
        style={{
          background: '#bbada0',
          padding: boardPad,
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* Background grid cells */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(4, ${TILE_SIZE}px)`, gap: GAP }}>
          {Array(16).fill(null).map((_, i) => (
            <div key={i} style={{ width: TILE_SIZE, height: TILE_SIZE, background: '#cdc1b4', borderRadius: 6 }} />
          ))}
        </div>

        {/* Tile layer — absolutely positioned over the grid */}
        <div style={{ position: 'absolute', top: boardPad, left: boardPad, width: boardSize, height: boardSize }}>
          {tiles.map(tile => <Tile key={tile.id} tile={tile} />)}
        </div>

        {/* Game Over overlay */}
        {gameOver && (
          <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center"
            style={{ background: 'rgba(238,228,218,0.73)' }}>
            <p className="text-4xl font-extrabold mb-2" style={{ color: '#776e65' }}>Game Over!</p>
            <p className="text-lg font-semibold mb-4" style={{ color: '#776e65' }}>Score: {score}</p>
            <button onClick={startNewGame} className="px-6 py-2 rounded-lg font-bold text-white"
              style={{ background: '#8f7a66' }}>Try Again</button>
          </div>
        )}

        {/* Win overlay */}
        {won && !keepPlaying && (
          <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center"
            style={{ background: 'rgba(237,194,46,0.82)' }}>
            <p className="text-4xl font-extrabold mb-2" style={{ color: '#f9f6f2' }}>You Win!</p>
            <p className="text-sm mb-4 font-semibold" style={{ color: '#f9f6f2' }}>You reached 2048!</p>
            <div className="flex gap-3">
              <button onClick={() => setKeepPlaying(true)} className="px-4 py-2 rounded-lg font-bold"
                style={{ background: '#f9f6f2', color: '#776e65' }}>Keep Going</button>
              <button onClick={startNewGame} className="px-4 py-2 rounded-lg font-bold"
                style={{ background: '#8f7a66', color: '#f9f6f2' }}>New Game</button>
            </div>
          </div>
        )}
      </div>

      {/* New high score badge */}
      {newHighScore && (
        <div className="mt-3 px-4 py-2 rounded-full text-sm font-bold animate-bounce"
          style={{ background: '#edcf72', color: '#776e65' }}>
          ★ New High Score!
        </div>
      )}

      {/* Name entry modal */}
      {showNameModal && (
        <Modal>
          <div className="p-6 flex flex-col items-center gap-4" style={{ minWidth: 280 }}>
            <p className="text-xl font-extrabold" style={{ color: '#776e65' }}>High Score!</p>
            <p className="text-sm text-center" style={{ color: '#776e65' }}>
              Score of <strong>{pendingScore?.score}</strong> made the top 10!
            </p>
            <input
              autoFocus
              type="text" placeholder="Enter your name"
              value={playerName} maxLength={20}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitHighScore()}
              className="w-full px-3 py-2 rounded border text-center font-semibold"
              style={{ borderColor: '#bbada0', color: '#776e65', outline: 'none' }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNameModal(false); setPlayerName(''); setPendingScore(null); }}
                className="px-4 py-2 rounded font-semibold text-sm"
                style={{ background: '#cdc1b4', color: '#776e65' }}
              >Skip</button>
              <button onClick={submitHighScore} className="px-4 py-2 rounded font-bold text-sm"
                style={{ background: '#8f7a66', color: '#f9f6f2' }}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Clear confirm modal */}
      {showClearConfirm && (
        <Modal>
          <div className="p-6 flex flex-col items-center gap-4" style={{ minWidth: 260 }}>
            <p className="text-lg font-bold" style={{ color: '#776e65' }}>Clear all scores?</p>
            <p className="text-sm" style={{ color: '#a09080' }}>This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded font-semibold text-sm"
                style={{ background: '#cdc1b4', color: '#776e65' }}>Cancel</button>
              <button onClick={clearHighScores} className="px-4 py-2 rounded font-bold text-sm"
                style={{ background: '#f65e3b', color: '#f9f6f2' }}>Clear</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tile component ────────────────────────────────────────────────────────────
// Outer div: handles position via CSS transition (sliding).
// Inner div: handles appear/merge animations, keyed by mk to re-trigger on merge.
function Tile({ tile }) {
  const [x, y] = tileXY(tile.row, tile.col);
  const { bg, fg } = tileColors(tile.value);
  const fontSize = tile.value >= 1024 ? 20 : tile.value >= 128 ? 24 : 28;

  return (
    <div
      style={{
        position: 'absolute',
        width: TILE_SIZE,
        height: TILE_SIZE,
        transform: `translate(${x}px, ${y}px)`,
        transition: `transform ${SLIDE_MS}ms ease-in-out`,
        zIndex: tile.state === 'merged' ? 10 : 1,
        willChange: 'transform',
      }}
    >
      <div
        key={tile.mk}
        className={tile.state === 'new' ? 'tile-appear' : tile.state === 'merged' ? 'tile-merge' : ''}
        style={{
          width: '100%', height: '100%',
          background: bg, color: fg,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize, fontWeight: 800,
        }}
      >
        {tile.value}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function ScoreBox({ label, value }) {
  return (
    <div className="flex flex-col items-center px-3 py-1 rounded-md min-w-[60px]"
      style={{ background: '#bbada0' }}>
      <span className="text-xs font-bold tracking-widest" style={{ color: '#eee4da' }}>{label}</span>
      <span className="text-lg font-extrabold leading-tight" style={{ color: '#f9f6f2' }}>{value}</span>
    </div>
  );
}

function Modal({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="rounded-xl shadow-2xl" style={{ background: '#faf8ef' }}>{children}</div>
    </div>
  );
}

function HighScoresPanel({ highScores, onClose, onClear }) {
  return (
    <div className="w-full max-w-md rounded-xl p-4 mb-4" style={{ background: '#eee4da' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-extrabold text-base" style={{ color: '#776e65' }}>High Scores</span>
        <div className="flex gap-2">
          <button onClick={onClear} className="text-xs px-2 py-1 rounded font-semibold"
            style={{ background: '#f65e3b', color: '#f9f6f2' }}>Clear</button>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded font-semibold"
            style={{ background: '#bbada0', color: '#f9f6f2' }}>Close</button>
        </div>
      </div>
      {highScores.length === 0 ? (
        <p className="text-sm text-center py-2" style={{ color: '#a09080' }}>No scores yet. Play a game!</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: '#a09080' }}>
              <th className="text-left pb-1 font-semibold">#</th>
              <th className="text-left pb-1 font-semibold">Name</th>
              <th className="text-right pb-1 font-semibold">Score</th>
              <th className="text-right pb-1 font-semibold">Best Tile</th>
              <th className="text-right pb-1 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {highScores.map((e, i) => (
              <tr key={i} style={{
                background: i === 0 ? 'rgba(237,194,46,0.25)' : 'transparent',
                fontWeight: i === 0 ? 700 : 400, color: '#776e65',
              }}>
                <td className="py-0.5 pr-2">{i === 0 ? '🏆' : `${i+1}.`}</td>
                <td className="py-0.5 max-w-[80px] truncate">{e.name}</td>
                <td className="py-0.5 text-right">{e.score.toLocaleString()}</td>
                <td className="py-0.5 text-right">{e.maxTile}</td>
                <td className="py-0.5 text-right text-xs opacity-70">{e.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
