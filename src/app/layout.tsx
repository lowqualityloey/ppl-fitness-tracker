import type { Metadata } from "next";
import localFont from "next/font/local";
import { ShellRegistration } from "../components/shell-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPL Fitness Tracker",
  description: "Push-Pull-Legs workout tracker",
};

/**
 * M3-02 (#59): Outfit is vendored at `./fonts/Outfit-Variable.woff2` (SIL OFL,
 * see `./fonts/OFL.txt`) and loaded with `next/font/local`. It used to come
 * from `next/font/google`, which downloaded it at build time; Google
 * intermittently answers with an extensionless font URL that Turbopack cannot
 * resolve (vercel/next.js#99114), and that failed a Vercel build on PR #179.
 * A checked-in file makes the build independent of that endpoint, and keeps
 * the no-third-party-CDN rule DESIGN.md's typography section requires.
 *
 * The generated `--font-outfit` variable is what `globals.css` binds into
 * `--font-display`.
 */
const outfit = localFont({
  src: "./fonts/Outfit-Variable.woff2",
  weight: "100 900",
  variable: "--font-outfit",
  display: "swap",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>
        {children}
        {/* M4-22 (#111): the offline-shell registration + update affordance. */}
        <ShellRegistration />
      </body>
    </html>
  );
}
