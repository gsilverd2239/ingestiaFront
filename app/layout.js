import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap"
});

export const metadata = {
  title: "ingestIA | Centro de Control y Sincronización SAP B1 Service Layer",
  description: "Servicio de Integración y Sincronización en Tiempo Real entre SAP Business One (HANA / Service Layer) y la API de Ingestión Comercia.",
  keywords: ["SAP Business One", "Service Layer", "HANA", "ingestIA", "Integrador", "Windows Service"]
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
