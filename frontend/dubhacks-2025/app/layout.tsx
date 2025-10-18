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
      <body className="bg-[#0A192F] text-white min-h-screen flex flex-col">
        {/* Navbar always on top */}
        <Navbar />

        {/* Page content */}
        <main className="flex-1 pt-20 px-4 md:px-8">{children}</main>
      </body>
    </html>
  );
}
