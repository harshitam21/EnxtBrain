import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enxt Brain — Company Intelligence Portal",
  description: "Private AI company brain for Inext AI — employees, projects, CRM, and documents in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
