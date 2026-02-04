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
   * Returns: { w: string[] unicode, b: string[] unicode }
   */
  const start = { w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 } };
  const current = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };

  for (const sq of game.SQUARES) {
    const p = game.get(sq);
    if (!p) continue;
    current[p.color][p.type] += 1;
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
 * Simple AI:
 * - Prefer captures
 * - Prefer checking moves
 * - Otherwise pick random
 */
function scoreMove(move) {
  let score = 0;
  if (move.captured) score += 10;
  if (move.san?.includes("+")) score += 3;
  if (move.san?.includes("#")) score += 100;
  // small preference for developing pieces (not pawns) early
  if (move.piece && move.piece !== "p") score += 0.5;
  return score + Math.random() * 0.25;
}

// PUBLIC_INTERFACE
export function pickAiMove(game) {
  /** Pick a move for the side to move. Returns a verbose move object or null. */
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;

  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = scoreMove(m);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}
