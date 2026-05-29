export const metadata = {
  title: "ACV Hackathon — Hello, Paid Agent",
  description: "Vercel × Coinbase x402 × Arize AX starter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
