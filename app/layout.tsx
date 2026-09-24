import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "Yume 夢 — speak the dream into being",
  description:
    "An immersive Japanese language-learning game: the AI-generated dream world only reacts when you describe it correctly, live, in Japanese. Built on Orbis.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (dark-mode and theme switchers) write their own
    // attributes onto <html>, such as style="color-scheme: light", before React
    // hydrates. This only silences attribute differences on this one element.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Zen+Maru+Gothic:wght@500;700&family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Fredoka:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
