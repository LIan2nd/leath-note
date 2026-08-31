"use client";

import * as React from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const pageStyle: React.CSSProperties = {
  alignItems: "center",
  background: "#24170f",
  color: "#f3eadb",
  display: "flex",
  fontFamily: "Georgia, serif",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "24px",
};

const cardStyle: React.CSSProperties = {
  background: "#332116",
  border: "1px solid rgba(231, 200, 143, 0.28)",
  borderRadius: "12px",
  boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
  maxWidth: "480px",
  padding: "24px",
  width: "100%",
};

const buttonStyle: React.CSSProperties = {
  background: "#e7c88f",
  border: "1px solid #f0d9ad",
  borderRadius: "8px",
  color: "#2d1d13",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  marginTop: "20px",
  minHeight: "44px",
  padding: "10px 16px",
  transition: "background-color 150ms ease-out, box-shadow 150ms ease-out",
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  React.useEffect(() => {
    console.error("Leath Notes global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <main style={pageStyle}>
          <section role="alert" aria-atomic="true" style={cardStyle}>
            <h1 style={{ fontSize: "1.35rem", margin: 0 }}>
              Leath Notes needs a fresh page
            </h1>
            <p style={{ color: "#dfd2bd", lineHeight: 1.6, margin: "12px 0 0" }}>
              Something unexpected interrupted the app. Anything already saved remains in your account. Try opening the page again.
            </p>
            <button type="button" onClick={reset} style={buttonStyle}>
              Try opening again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
