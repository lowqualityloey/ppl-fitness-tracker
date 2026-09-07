import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPL Fitness Tracker",
  description: "Push-Pull-Legs workout tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
