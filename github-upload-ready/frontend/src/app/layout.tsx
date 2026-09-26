import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Queue — Make time for what matters",
  description: "Book campus services, manage appointments, and follow your place in line.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
