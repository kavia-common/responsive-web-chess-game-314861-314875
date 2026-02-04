import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Board from "./components/Board";
import { computeCapturedPieces, createNewGame, getLegalMovesByFrom, pickAiMove } from "./chess/logic";

const GAME_MODES = {
  HUMAN: "human",
  AI: "ai",
};

const AI_SIDES = {
  BLACK: "b",
  WHITE: "w",
};

function formatStatus(game) {
  if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`;
  if (game.isStalemate()) return "Stalemate — draw";
  if (game.isThreefoldRepetition()) return "Threefold repetition — draw";
  if (game.isInsufficientMaterial()) return "Insufficient material — draw";
  if (game.isDraw()) return "Draw";
  if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} to move — Check`;
  return `${game.turn() === "w" ? "White" : "Black"} to move`;
}

/**
 * Create move history rows as [ { moveNumber, white, black } ... ].
 */
function toMoveTable(historySan) {
  const rows = [];
  for (let i = 0; i < historySan.length; i += 2) {
    rows.push({
      moveNumber: 1 + i / 2,
      white: historySan[i] ?? "",
      black: historySan[i + 1] ?? "",
    });
  }
  return rows;
}

// PUBLIC_INTERFACE
function App() {
  /** Main application entry for the responsive chess game. */
  const [game, setGame] = useState(() => createNewGame());
  const [mode, setMode] = useState(GAME_MODES.AI);
  const [aiSide, setAiSide] = useState(AI_SIDES.BLACK);
  const [orientation, setOrientation] = useState("w");

  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }
  const [lastMove, setLastMove] = useState({ from: null, to: null });
  const [isAiThinking, setIsAiThinking] = useState(false);

  // A ref used to avoid setState on unmounted component during AI timeout.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const legalByFrom = useMemo(() => getLegalMovesByFrom(game), [game]);
  const legalToSquares = useMemo(() => {
    if (!selected) return new Set();
    const list = legalByFrom.get(selected) ?? [];
    return new Set(list.map((m) => m.to));
  }, [legalByFrom, selected]);

  const lastMoveSquares = useMemo(() => new Set([lastMove.from, lastMove.to].filter(Boolean)), [lastMove]);
  const historySan = useMemo(() => game.history(), [game]);
  const moveTable = useMemo(() => toMoveTable(historySan), [historySan]);
  const captured = useMemo(() => computeCapturedPieces(game), [game]);

  const statusText = useMemo(() => formatStatus(game), [game]);
  const gameOver = useMemo(() => game.isGameOver(), [game]);

  const isAiEnabled = mode === GAME_MODES.AI;
  const aiPlaysColor = isAiEnabled ? aiSide : null;
  const isAiTurn = isAiEnabled && game.turn() === aiPlaysColor;

  const inCheckSquare = useMemo(() => {
    if (!game.inCheck()) return null;

    // If side to move is in check, find its king square.
    // chess.js v1 doesn't provide `game.SQUARES` on the instance; scan via `game.board()`.
    const kingColor = game.turn();
    const board = game.board(); // [rank8..rank1][file a..h]

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        if (p.type === "k" && p.color === kingColor) {
          const file = "abcdefgh"[c];
          const rank = 8 - r;
          return `${file}${rank}`;
        }
      }
    }

    return null;
  }, [game]);

  const applyMove = (moveObj) => {
    const next = createNewGame();
    next.loadPgn(game.pgn());
    const move = next.move(moveObj);
    if (!move) return false;

    setGame(next);
    setSelected(null);
    setPendingPromotion(null);
    setLastMove({ from: move.from, to: move.to });
    return true;
  };

  const tryMove = (from, to) => {
    const moves = (legalByFrom.get(from) ?? []).filter((m) => m.to === to);
    if (!moves.length) return false;

    // Promotion handling: if multiple moves exist, chess.js provides different promotion options.
    if (moves.length > 1 || moves[0].promotion) {
      setPendingPromotion({ from, to });
      return true;
    }

    return applyMove({ from, to });
  };

  const onSquareClick = (square) => {
    if (gameOver) return;
    if (isAiTurn || isAiThinking) return;

    // If awaiting promotion choice, ignore board clicks to avoid ambiguous state.
    if (pendingPromotion) return;

    if (!selected) {
      // Select only if the square has a piece of side-to-move.
      const p = game.get(square);
      if (!p) return;
      if (p.color !== game.turn()) return;
      setSelected(square);
      return;
    }

    if (square === selected) {
      setSelected(null);
      return;
    }

    // If clicking another own piece, switch selection.
    const p = game.get(square);
    if (p && p.color === game.turn()) {
      setSelected(square);
      return;
    }

    // Attempt move.
    const moved = tryMove(selected, square);
    if (!moved) {
      // invalid destination -> clear selection for a simpler mobile UX
      setSelected(null);
    }
  };

  const doUndo = () => {
    if (isAiThinking) return;
    const next = createNewGame();
    next.loadPgn(game.pgn());

    if (mode === GAME_MODES.AI) {
      // Undo 2 ply when possible (AI + human) to keep same side to play.
      next.undo();
      next.undo();
    } else {
      next.undo();
    }

    setGame(next);
    setSelected(null);
    setPendingPromotion(null);
    setLastMove({ from: null, to: null });
  };

  const doReset = () => {
    if (isAiThinking) return;
    setGame(createNewGame());
    setSelected(null);
    setPendingPromotion(null);
    setLastMove({ from: null, to: null });
  };

  const doFlip = () => {
    setOrientation((o) => (o === "w" ? "b" : "w"));
  };

  // Handle promotion dialog selection.
  const choosePromotion = (promotion) => {
    if (!pendingPromotion) return;
    applyMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion });
  };

  // AI move effect (simple local AI).
  useEffect(() => {
    if (!isAiTurn) return;
    if (gameOver) return;

    setIsAiThinking(true);
    const t = window.setTimeout(() => {
      try {
        const next = createNewGame();
        next.loadPgn(game.pgn());

        const pick = pickAiMove(next);
        if (!pick) return;

        const moved = next.move({ from: pick.from, to: pick.to, promotion: pick.promotion });
        if (!moved) return;

        if (!isMountedRef.current) return;
        setGame(next);
        setSelected(null);
        setPendingPromotion(null);
        setLastMove({ from: moved.from, to: moved.to });
      } finally {
        if (isMountedRef.current) setIsAiThinking(false);
      }
    }, 450);

    return () => window.clearTimeout(t);
  }, [game, gameOver, isAiTurn]);

  // When switching mode/AI side, clear selection and promotion state (avoids confusing UI).
  useEffect(() => {
    setSelected(null);
    setPendingPromotion(null);
  }, [mode, aiSide]);

  const vsLabel = mode === GAME_MODES.AI ? `vs AI (${aiSide === "w" ? "AI = White" : "AI = Black"})` : "Two-player";

  return (
    <div className="App">
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <h1>Web Chess</h1>
            <p>Responsive board, legal moves, history, captures, undo/reset.</p>
          </div>
          <div className="pills" aria-label="Game status">
            <div className="pill">
              <strong>Status:</strong> {statusText}
            </div>
            <div className="pill">
              <strong>Mode:</strong> {vsLabel}
            </div>
            <div className="pill">
              <strong>Turn:</strong> {game.turn() === "w" ? "White" : "Black"}
            </div>
          </div>
        </div>

        <div className="layout">
          <div className="card boardCard">
            <div className="meta" style={{ marginBottom: 12 }}>
              <span className="metaBadge">
                <span className={`metaDot ${game.turn() === "w" ? "" : "cyan"}`} />
                {game.turn() === "w" ? "White to play" : "Black to play"}
              </span>
              {game.inCheck() ? (
                <span className="metaBadge">
                  <span className="metaDot red" />
                  Check
                </span>
              ) : null}
              {isAiTurn || isAiThinking ? (
                <span className="metaBadge">
                  <span className="metaDot cyan" />
                  AI thinking…
                </span>
              ) : null}

              <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={doFlip} aria-label="Flip board">
                  Flip
                </button>
                <button type="button" className="btn" onClick={doUndo} disabled={historySan.length === 0 || isAiThinking} aria-label="Undo move">
                  Undo
                </button>
                <button type="button" className="btn btnDanger" onClick={doReset} disabled={isAiThinking} aria-label="Reset game">
                  Reset
                </button>
              </div>
            </div>

            <div className="boardWrap">
              <Board
                game={game}
                orientation={orientation}
                selectedSquare={selected}
                legalToSquares={legalToSquares}
                lastMoveSquares={lastMoveSquares}
                inCheckSquare={inCheckSquare}
                onSquareClick={onSquareClick}
              />
            </div>

            {pendingPromotion ? (
              <div className="note" role="dialog" aria-label="Choose promotion">
                <div style={{ marginBottom: 8, fontWeight: 700, color: "#111827" }}>Promote pawn to:</div>
                <div className="btnRow">
                  <button type="button" className="btn btnPrimary" onClick={() => choosePromotion("q")}>
                    Queen
                  </button>
                  <button type="button" className="btn" onClick={() => choosePromotion("r")}>
                    Rook
                  </button>
                  <button type="button" className="btn" onClick={() => choosePromotion("b")}>
                    Bishop
                  </button>
                  <button type="button" className="btn" onClick={() => choosePromotion("n")}>
                    Knight
                  </button>
                </div>
              </div>
            ) : (
              <div className="note">
                Tip: Click a piece to see legal moves. Click destination to move. Use <span className="kbd">Undo</span> /{" "}
                <span className="kbd">Reset</span>. In vs-AI mode, AI prefers captures/checks.
              </div>
            )}
          </div>

          <div className="card sideCard">
            <div className="controlsGrid">
              <div>
                <div className="sectionTitle">Settings</div>
                <div className="row">
                  <div>
                    <label htmlFor="mode">Game mode</label>
                    <select
                      id="mode"
                      className="select"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      disabled={isAiThinking}
                    >
                      <option value={GAME_MODES.AI}>Vs AI</option>
                      <option value={GAME_MODES.HUMAN}>Two-player</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="aiSide">AI side</label>
                    <select
                      id="aiSide"
                      className="select"
                      value={aiSide}
                      onChange={(e) => setAiSide(e.target.value)}
                      disabled={mode !== GAME_MODES.AI || isAiThinking}
                    >
                      <option value={AI_SIDES.BLACK}>Black</option>
                      <option value={AI_SIDES.WHITE}>White</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="columns2">
                <div>
                  <div className="sectionTitle">Captured</div>
                  <div className="captures" aria-label="Captured pieces">
                    <div className="captureRow">
                      <div className="side">
                        <span className="metaDot" /> White lost
                      </div>
                      <div className="pieces" aria-label="White captured by black">
                        {captured.w.length ? captured.w.join(" ") : <span style={{ color: "#94a3b8" }}>—</span>}
                      </div>
                    </div>
                    <div className="captureRow">
                      <div className="side">
                        <span className="metaDot cyan" /> Black lost
                      </div>
                      <div className="pieces" aria-label="Black captured by white">
                        {captured.b.length ? captured.b.join(" ") : <span style={{ color: "#94a3b8" }}>—</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="sectionTitle">PGN</div>
                  <div className="note" style={{ marginTop: 0 }}>
                    Copy/share your game record:
                    <div style={{ marginTop: 8 }}>
                      <textarea
                        readOnly
                        value={game.pgn()}
                        style={{
                          width: "100%",
                          minHeight: 96,
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          padding: 10,
                          resize: "vertical",
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          fontSize: 11,
                          color: "#111827",
                          background: "#fff",
                        }}
                        aria-label="PGN record"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="sectionTitle">Move History</div>
                <div className="history" aria-label="Move history">
                  <div className="historyHeader">
                    <div>#</div>
                    <div>White</div>
                    <div>Black</div>
                  </div>
                  <div className="historyBody">
                    {moveTable.length === 0 ? (
                      <div className="historyRow" style={{ gridTemplateColumns: "1fr" }}>
                        <div style={{ color: "#94a3b8" }}>No moves yet.</div>
                      </div>
                    ) : (
                      moveTable.map((r) => (
                        <div key={r.moveNumber} className="historyRow">
                          <strong>{r.moveNumber}</strong>
                          <div>{r.white}</div>
                          <div>{r.black}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="note">
                  Notes: In vs-AI mode, <span className="kbd">Undo</span> removes your last move and the AI reply (when possible).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
