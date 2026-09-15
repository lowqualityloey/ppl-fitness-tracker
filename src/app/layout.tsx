import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { ShellRegistration } from "../components/shell-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPL Fitness Tracker",
  description: "Push-Pull-Legs workout tracker",
};

/**
 * M3-02 (#59): Outfit self-hosted via next/font — fetched at build time and
 * served from the app's own origin, so no third-party CDN request ever
 * happens on a user's font moment (DESIGN.md typography is Outfit-only and
 * the #59 card bans the CDN). The generated `--font-outfit` variable is what
 * `globals.css` binds into `--font-display`.
 */
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
