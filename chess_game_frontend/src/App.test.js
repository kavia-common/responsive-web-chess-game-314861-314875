import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders chess app header", () => {
  render(<App />);
  expect(screen.getByText(/Web Chess/i)).toBeInTheDocument();
  expect(screen.getByText(/Move History/i)).toBeInTheDocument();
});
