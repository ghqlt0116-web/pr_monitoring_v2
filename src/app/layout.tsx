import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SKB PR 모니터링',
  description: '공중파/종편 시사 프로그램 리스크 모니터링 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
