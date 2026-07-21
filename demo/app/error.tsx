"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="wrap">
      <section className="fail">
        <div className="bar" />
        <div className="fail-code">Error</div>
        <h2>That didn&apos;t hold heat</h2>
        <p className="prose">
          Something broke rendering this page. The rest of the site is static and should still work.
          If you were on the playground, the GPU endpoint scales to zero, so a retry after a moment
          often lands.
        </p>
        <div className="fail-actions">
          <button className="pg-go" onClick={reset}>
            Try again
          </button>
          <Link className="fail-home" href="/">
            Back to overview
          </Link>
        </div>
        {error.digest && <p className="caption">Digest: {error.digest}</p>}
      </section>
    </div>
  );
}
