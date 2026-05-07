import { useState } from "react";

interface CounterProps {
  initialCount?: number;
}

export default function Counter({ initialCount = 0 }: CounterProps) {
  const [count, setCount] = useState(initialCount);

  return (
    <section>
      <h3>Client React component</h3>
      <p>
        This component hydrates in the browser and keeps local interactive state.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setCount((value) => value - 1)}>
          -1
        </button>
        <strong>Count: {count}</strong>
        <button type="button" onClick={() => setCount((value) => value + 1)}>
          +1
        </button>
        <button type="button" onClick={() => setCount(initialCount)}>
          Reset
        </button>
      </div>
    </section>
  );
}
