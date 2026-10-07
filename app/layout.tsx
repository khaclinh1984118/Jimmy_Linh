import "./globals.css";

export const metadata = {
  title: "Jimmy AI Video Generator",
  description: "Simple text-to-video generator starter",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
