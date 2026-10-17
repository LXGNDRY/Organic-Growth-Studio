import type { Metadata } from 'next';
import './globals.css';

export const metadata:Metadata={title:'Signal / Organic Growth Studio',description:'A practical workspace for earning qualified visits through better discovery.'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
