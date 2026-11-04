import type { Metadata } from "next";
import { DialogProvider } from "@/components/Dialogs";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Town",
  description: "A visual office for your own agent teams and workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DialogProvider>
          <Shell>{children}</Shell>
        </DialogProvider>
      </body>
    </html>
  );
}
