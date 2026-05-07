interface RequestSnapshotProps {
  method: string;
  path: string;
  requestId: string;
  renderedAt: string;
}

export default function RequestSnapshot({
  method,
  path,
  requestId,
  renderedAt,
}: RequestSnapshotProps) {
  return (
    <section>
      <h3>Server-rendered React component</h3>
      <p>
        This React component is rendered on the server during the Astro request,
        with no client hydration attached.
      </p>
      <pre>
        <code>{`method:     ${method}
path:       ${path}
request-id: ${requestId}
renderedAt: ${renderedAt}`}</code>
      </pre>
    </section>
  );
}
