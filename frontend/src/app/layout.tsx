import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: { default: "ACIS · Don't just choose a career. Build one.", template: "%s · ACIS" },
  description: "ACIS is an adaptive career mentor for students in India. It keeps learning about you over time, explains every suggestion, and never pushes a choice.",
};
export const viewport: Viewport = { themeColor: "#F6F2EA", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
