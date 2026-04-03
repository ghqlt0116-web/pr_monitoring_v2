'use client';
import { Globe, LayoutDashboard, MonitorPlay, Youtube } from 'lucide-react';
import Link from 'next/link';
import styles from '../page.module.css';

export default function CommunityDashboard() {
    return (
        <div className={styles.container}>
            <aside className={`glass-panel ${styles.sidebar}`}>
                <div className={styles.brand}>
                    <div className={styles.logoBox}>
                        <LayoutDashboard size={24} color="#10b981" />
                    </div>
                    <h1>SKB PR 모니터링</h1>
                </div>

                <nav className={styles.nav}>
                    <div className={styles.navGroup}>
                        <Link href="/" replace style={{ textDecoration: 'none' }}>
                            <div className={styles.navGroupHeader}>
                                <span><MonitorPlay size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#3b82f6" />시사 프로그램 모니터링</span>
                            </div>
                        </Link>
                    </div>

                    <div className={styles.navGroup}>
                        <Link href="/creators" replace style={{ textDecoration: 'none' }}>
                            <div className={styles.navGroupHeader}>
                                <span><Youtube size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#ef4444" />유튜버 모니터링</span>
                            </div>
                        </Link>
                    </div>

                    <div className={styles.navGroup}>
                        <div className={`${styles.navGroupHeader} ${styles.activeNav}`}>
                            <span><Globe size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#10b981" />외부 커뮤니티</span>
                        </div>
                        <div className={styles.subNav}>
                            <a href="#" className={`${styles.navItem} ${styles.active}`}>
                                블로그/카페 (준비중)
                            </a>
                        </div>
                    </div>
                </nav>
            </aside>

            <main className={styles.main}>
                <header className={`animate-fade-in ${styles.header}`}>
                    <div>
                        <h2 className={styles.pageTitle}>블로그/커뮤니티 모니터링</h2>
                        <p className={styles.subtitle} style={{ margin: 0, marginTop: '0.5rem' }}>네이버 블로그, 티스토리, 클리앙 등 텍스트 중심 플랫폼 동향 파악</p>
                    </div>
                </header>
                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Globe size={64} color="#10b981" style={{ margin: '0 auto 1.5rem', opacity: 0.5 }} />
                    <h3 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.5rem' }}>현재 시스템 준비 중입니다</h3>
                    <p style={{ color: 'var(--text-muted)', maxWidth: '600px', lineHeight: '1.6' }}>
                        기존 시사 모니터링이나 유튜브(글로벌 API)와 다르게, 외부 커뮤니티 통신망은 각 웹사이트별로 HTML 뼈대가 완전히 다릅니다.<br /><br />
                        팀장님께서 모니터링을 원하시는 <strong>타겟 사이트 명단 (예: 클리앙, 보배드림, 특정 IT블로거 주소)</strong>들을 취합하여 AI팀으로 요청해 주시면, 각각의 사이트에 맞는 전용 스크래핑 엔진을 장착해 드리겠습니다!
                    </p>
                </div>
            </main>
        </div>
    );
}
