import React from "react";
import { getBoardMatrix, pieceToUnicode } from "../chess/logic";

/**
 * Board is a pure UI component:
 * - Renders an 8x8 grid for the given orientation
 * - Shows selection and legal destination highlights
 * - Forwards square clicks to parent
 */
export default function Board({
  game,
  orientation,
  selectedSquare,
  legalToSquares,
  lastMoveSquares,
  inCheckSquare,
  onSquareClick,
}) {
  const matrix = getBoardMatrix(game, orientation);

  return (
    <div className="board" role="grid" aria-label="Chess board">
      {matrix.flatMap((row, r) =>
        row.map((cell, c) => {
          const isLight = (r + c) % 2 === 0;
          const isSelected = selectedSquare === cell.square;
          const isLegal = legalToSquares.has(cell.square);
          const isCapture = isLegal && !!cell.piece;
          const isLastMove = lastMoveSquares.has(cell.square);
          const isInCheck = inCheckSquare === cell.square;

          const className = [
            "square",
            isLight ? "light" : "dark",
            isSelected ? "selected" : "",
            isLegal ? "legal" : "",
            isCapture ? "capture" : "",
            isLastMove ? "lastMove" : "",
            isInCheck ? "inCheck" : "",
          ]
            .filter(Boolean)
            .join(" ");

          // Coordinates on a1 corner: show file on bottom rank and rank on left file.
          const showFile = r === 7;
          const showRank = c === 0;
          const coord = `${showFile ? cell.square[0] : ""}${showRank ? cell.square[1] : ""}`;

          return (
            <button
              key={cell.square}
              type="button"
              className={className}
              onClick={() => onSquareClick(cell.square)}
              role="gridcell"
              aria-label={`Square ${cell.square}${cell.piece ? `, ${cell.piece.color === "w" ? "white" : "black"} ${cell.piece.type}` : ""}`}
            >
              {coord ? <span className="coord">{coord}</span> : null}
              <span aria-hidden="true">{pieceToUnicode(cell.piece)}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
