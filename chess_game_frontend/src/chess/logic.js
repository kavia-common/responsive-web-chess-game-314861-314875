import { Chess } from "chess.js";

/**
 * Maps chess.js piece objects to Unicode piece symbols.
 * chess.js piece: { type: 'p|n|b|r|q|k', color: 'w|b' }
 */
const UNICODE = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_VALUE = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/**
 * Difficulty settings tuned for a fast, frontend-only chess AI.
 * - Depth drives tactical strength quickly.
 * - Easier levels inject randomness and reduce tactical sharpness.
 */
const AI_DIFFICULTY_PRESETS = {
  easy: { label: "Easy", depth: 1, randomness: 0.35 },
  medium: { label: "Medium", depth: 2, randomness: 0.18 },
  hard: { label: "Hard", depth: 3, randomness: 0.07 },
};

// PUBLIC_INTERFACE
export function getAiDifficultyPresets() {
  /** Return available AI difficulty presets (key -> {label, depth, randomness}). */
  return AI_DIFFICULTY_PRESETS;
}

// PUBLIC_INTERFACE
export function createNewGame() {
  /** Create a new chess.js instance in the starting position. */
  return new Chess();
}

// PUBLIC_INTERFACE
export function pieceToUnicode(piece) {
  /** Convert a chess.js piece object to a unicode glyph for UI rendering. */
  if (!piece) return "";
  return UNICODE[piece.color]?.[piece.type] ?? "";
}

// PUBLIC_INTERFACE
export function idxToSquare(row, col, orientation = "w") {
  /**
   * Convert UI board coordinates (row 0..7, col 0..7) to algebraic square.
   * orientation 'w': row 0 is rank 8. orientation 'b': row 0 is rank 1.
   */
  const file = orientation === "w" ? FILES[col] : FILES[7 - col];
  const rank = orientation === "w" ? 8 - row : row + 1;
  return `${file}${rank}`;
}

// PUBLIC_INTERFACE
export function squareToIdx(square, orientation = "w") {
  /** Convert algebraic square (e.g., e4) to UI indices (row, col). */
  const file = square[0];
  const rank = parseInt(square[1], 10);
  const fileIdx = FILES.indexOf(file);
  if (fileIdx < 0 || Number.isNaN(rank)) return null;

  const col = orientation === "w" ? fileIdx : 7 - fileIdx;
  const row = orientation === "w" ? 8 - rank : rank - 1;
  return { row, col };
}

// PUBLIC_INTERFACE
export function getBoardMatrix(game, orientation = "w") {
  /**
   * Returns a matrix [8][8] of { square, piece } in display order for the given orientation.
   */
  const rows = [];
  for (let r = 0; r < 8; r++) {
    const cols = [];
    for (let c = 0; c < 8; c++) {
      const square = idxToSquare(r, c, orientation);
      cols.push({ square, piece: game.get(square) });
    }
    rows.push(cols);
  }
  return rows;
}

// PUBLIC_INTERFACE
export function getLegalMovesByFrom(game) {
  /**
   * Create a map: fromSquare -> array of verbose move objects.
   * Used to quickly highlight legal destinations after selection.
   */
  const legal = new Map();
  for (const m of game.moves({ verbose: true })) {
    const list = legal.get(m.from) ?? [];
    list.push(m);
    legal.set(m.from, list);
  }
  return legal;
}

// PUBLIC_INTERFACE
export function computeCapturedPieces(game) {
  /**
   * Compute captured pieces by comparing start counts to current board counts.
   *
   * chess.js v1 does not expose `SQUARES` on the Chess instance (i.e. `game.SQUARES`),
   * so we iterate the position via `game.board()` which is part of the public API.
   *
   * Returns: { w: string[] unicode, b: string[] unicode }
   */
  const start = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
  };

  const current = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  // game.board() is an 8x8 matrix (rank 8 -> 1). Each entry is either null or a piece object.
  const board = game.board();
  for (const rank of board) {
    for (const p of rank) {
      if (!p) continue;
      current[p.color][p.type] += 1;
    }
  }

  const captured = { w: [], b: [] };
  for (const color of ["w", "b"]) {
    for (const type of ["q", "r", "b", "n", "p", "k"]) {
      const missing = start[color][type] - current[color][type];
      for (let i = 0; i < missing; i++) captured[color].push(UNICODE[color][type]);
    }
  }

  return captured;
}

/**
 * Legacy simple AI scoring (still used as a fallback / tie-breaker flavor):
 * - Prefer captures
 * - Prefer checking moves
 * - Otherwise pick random
 */
function scoreMoveHeuristic(move) {
  let score = 0;
  if (move.captured) score += 10;
  if (move.san?.includes("+")) score += 3;
  if (move.san?.includes("#")) score += 100;
  // small preference for developing pieces (not pawns) early
  if (move.piece && move.piece !== "p") score += 0.5;
  return score + Math.random() * 0.25;
}

function evaluateMaterial(game) {
  // Positive means White is ahead; negative means Black is ahead.
  let sum = 0;
  const board = game.board();
  for (const rank of board) {
    for (const p of rank) {
      if (!p) continue;
      const v = PIECE_VALUE[p.type] ?? 0;
      sum += p.color === "w" ? v : -v;
    }
  }
  return sum;
}

function terminalScore(game, perspectiveColor) {
  // perspectiveColor: 'w' or 'b' whose best move we're selecting.
  // Large values so checkmate is always preferred over material.
  if (game.isCheckmate()) {
    // If it's checkmate and it's the side to move, that side is mated (bad for side to move).
    const sideToMove = game.turn();
    const sideToMoveIsPerspective = sideToMove === perspectiveColor;
    return sideToMoveIsPerspective ? -1_000_000 : 1_000_000;
  }
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition() || game.isInsufficientMaterial()) {
    return 0;
  }
  return null;
}

function minimax(game, depth, alpha, beta, perspectiveColor) {
  const term = terminalScore(game, perspectiveColor);
  if (term !== null) return term;

  if (depth === 0) {
    const material = evaluateMaterial(game);
    // Convert material eval into perspective view.
    return perspectiveColor === "w" ? material : -material;
  }

  const maximizing = game.turn() === perspectiveColor;
  const moves = game.moves({ verbose: true });

  if (!moves.length) {
    // Safety: should be covered by terminalScore, but keep it robust.
    return 0;
  }

  if (maximizing) {
    let value = -Infinity;
    for (const m of moves) {
      game.move(m);
      const child = minimax(game, depth - 1, alpha, beta, perspectiveColor);
      game.undo();

      value = Math.max(value, child);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const m of moves) {
    game.move(m);
    const child = minimax(game, depth - 1, alpha, beta, perspectiveColor);
    game.undo();

    value = Math.min(value, child);
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function clampDifficultyKey(key) {
  if (key && AI_DIFFICULTY_PRESETS[key]) return key;
  return "medium";
}

// PUBLIC_INTERFACE
export function pickAiMove(game, options = {}) {
  /**
   * Pick a move for the side to move. Returns a verbose move object or null.
   *
   * Options:
   * - difficulty: 'easy' | 'medium' | 'hard'
   *
   * Strength scaling:
   * - easy: depth 1 + higher randomness
   * - medium: depth 2
   * - hard: depth 3 + low randomness
   */
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;

  const difficultyKey = clampDifficultyKey(options.difficulty);
  const preset = AI_DIFFICULTY_PRESETS[difficultyKey];
  const perspectiveColor = game.turn();

  // On easier levels, occasionally play a non-best move for variety / weakness.
  // We do this AFTER scoring so it still feels "somewhat chess-like".
  const randomness = preset.randomness ?? 0;

  // Evaluate each move with minimax + small heuristic spice for tie-breaking.
  const scored = [];
  for (const m of moves) {
    game.move(m);
    const mm = minimax(game, preset.depth - 1, -Infinity, Infinity, perspectiveColor);
    game.undo();

    // Heuristic used as a tiny tie-breaker so AI still "likes" captures/checks
    // when minimax considers moves equivalent at limited depth.
    const spice = scoreMoveHeuristic(m) * 0.35;
    scored.push({ move: m, score: mm + spice });
  }

  scored.sort((a, b) => b.score - a.score);

  // If randomness triggers, pick among top N (or from all if very few).
  if (Math.random() < randomness) {
    const n = Math.min(4, scored.length);
    const idx = Math.floor(Math.random() * n);
    return scored[idx].move;
  }

  return scored[0].move;
}
