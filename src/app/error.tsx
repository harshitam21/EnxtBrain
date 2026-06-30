"use client";

import React from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="error-page" style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      background: "var(--gradient-bg)" // using theme var
    }}>
      <h1 style={{ color: "var(--accent-purple)" }}>Something went wrong</h1>
      <p style={{ color: "var(--text-dark)" }}>{error.message}</p>
      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            background: "var(--accent-purple)",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            transition: "background 0.2s"
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#5c4ab3")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--accent-purple)")}
        >
          Try again
        </button>
        <Link href="/" style={{ marginLeft: "1rem", color: "var(--accent-purple)" }}>Home</Link>
      </div>
    </div>
  );
}
