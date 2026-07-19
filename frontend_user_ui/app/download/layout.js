export const metadata = {
  title: 'reddymatka  - Download App',
  description: 'Download reddymatka  - The most trusted platform for  Matka results, live updates, and charts.',
  openGraph: {
    title: 'reddymatka ',
    description: 'Download reddymatka  app. The most trusted platform for  Matka results, live updates, and charts.',
    images: [
      {
        url: 'https://reddymatka.com/icons/reddymatka_icon_512.png',
        width: 512,
        height: 512,
        alt: 'reddymatka  App',
        type: 'image/png',
      },
    ],
    type: 'website',
    siteName: 'reddymatka ',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'reddymatka  - Download App',
    description: 'Download reddymatka  app. The most trusted platform for  Matka results.',
    images: ['https://reddymatka.com/icons/reddymatka_icon_512.png'],
  },
  icons: {
    icon: '/icons/reddymatka_icon_192.png',
    apple: '/icons/reddymatka_icon_192.png',
  },
};

export default function DownloadLayout({ children }) {
  return children;
}
