import type { Metadata } from "next";
import Navbar from "./components/navbar";

export const metadata: Metadata = {
  title: "InterView AI",
  description: "Your personal AI interview coach — analyze and improve your performance with real-time feedback.",
  icons: {
    icon: "/favicon.ico",
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Navbar always on top */}
        <Navbar />

        {/* Page content */}
        <main>{children}</main>
      </body>
    </html>
  );
}
