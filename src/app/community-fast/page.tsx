'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MonitorPlay, Youtube, Globe, Settings, LayoutDashboard, Plus, Trash2, Activity, Clock } from 'lucide-react';
import styles from '../page.module.css';

export default function CommunityFastDashboard() {
    const [targets, setTargets] = useState<any[]>([]);
    const [keywords, setKeywords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [newSiteType, setNewSiteType] = useState('PPOMPPU');
    const [newKeyword, setNewKeyword] = useState('');
    const [newSubKeyword, setNewSubKeyword] = useState('');
    const [newExcludeKeyword, setNewExcludeKeyword] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tRes, kRes] = await Promise.all([
                fetch('/api/community-fast/targets', { cache: 'no-store' }),
                fetch('/api/community-fast/keywords', { cache: 'no-store' })
            ]);

            const tData = await tRes.json();
            const kData = await kRes.json();

            setTargets(Array.isArray(tData) ? tData : []);
            setKeywords(Array.isArray(kData) ? kData : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const addTarget = async () => {
        await fetch('/api/community-fast/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteType: newSiteType })
        });
        fetchData();
    };

    const removeTarget = async (id: number) => {
        if (!confirm('해당 타겟을 삭제하시겠습니까?')) return;
        await fetch('/api/community-fast/targets', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchData();
    };

    const addKeyword = async () => {
        const main = newKeyword.trim();
        if (!main) return;

        const subs = newSubKeyword.split(',').map(s => s.trim()).filter(s => s);
        const excludes = newExcludeKeyword.split(',').map(s => s.trim()).filter(s => s);

        const excludeStr = excludes.length > 0 ? '-' + excludes.join('-') : '';
        let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}${excludeStr}`) : [`${main}${excludeStr}`];

        let hasError = false;
        for (const word of newItems) {
            const res = await fetch('/api/community-fast/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: word })
            });
            const data = await res.json();
            if (data.error && !data.error.includes('Unique constraint')) hasError = true;
        }

        setNewKeyword('');
        setNewSubKeyword('');
        setNewExcludeKeyword('');
        fetchData();
    };

    const removeKeyword = async (id: number) => {
        await fetch('/api/community-fast/keywords', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchData();
    };

    const Sidebar = () => (
        <aside className={`glass-panel ${styles.sidebar}`}>
            <div className={styles.brand}>
                <div className={styles.logoBox}>
                    <LayoutDashboard size={24} color="#f59e0b" />
                </div>
                <h1 style={{ fontSize: '1.2rem' }}>SKB PR 모니터링</h1>
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
                        <span><Activity size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#f59e0b" />커뮤니티 (실시간)</span>
                    </div>
                </div>

                <div className={styles.navGroup}>
                    <Link href="/community" replace style={{ textDecoration: 'none' }}>
                        <div className={styles.navGroupHeader}>
                            <span><Globe size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#10b981" />블로그 모니터링</span>
                        </div>
                    </Link>
                </div>
            </nav>
        </aside>
    );

    return (
        <div className={styles.container}>
            <Sidebar />

            <main className={styles.main}>
                <header className={`animate-fade-in ${styles.header}`}>
                    <div>
                        <h2 className={styles.pageTitle}>실시간 커뮤니티 모니터링 (텔레그램 전용)</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <p className={styles.subtitle} style={{ margin: 0 }}>외부 무료 크론 서비스 연동을 통한 실시간 키워드 감지</p>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Clock size={14} /> 게시판을 DB에 저장하지 않고, 텔레그램 긴급 알림방으로 즉시 발송합니다.
                            </span>
                        </div>
                    </div>
                </header>

                <div className={styles.configGrid} style={{ marginTop: '2rem' }}>
                    {/* Target Sites Section */}
                    <section className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h4 style={{ fontSize: '1.1rem', color: '#f59e0b' }}>🌐 실시간 모니터링 타겟 등록</h4>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', minWidth: 0 }}>
                            <select
                                value={newSiteType}
                                onChange={(e) => setNewSiteType(e.target.value)}
                                className={styles.settingsInput}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                            >
                                <option value="PPOMPPU" style={{ color: 'black' }}>뽐뿌 (자유게시판)</option>
                                <option value="RULIWEB" style={{ color: 'black' }}>루리웹 (유머게시판)</option>
                            </select>
                            <button onClick={addTarget} className={styles.editBtn} style={{ background: '#f59e0b', padding: '0 1.5rem', flexShrink: 0, color: 'black', fontWeight: 'bold' }}><Plus size={18} /></button>
                        </div>

                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[...targets].map(t => (
                                <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', minWidth: 0 }}>
                                    <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                                        <strong style={{ color: '#f59e0b' }}>{t.siteName}</strong>
                                        <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                마지막 확인한 게시물 ID: {t.lastScrapedPostId || '없음'}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <button onClick={() => removeTarget(t.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-high)', cursor: 'pointer', padding: '0.5rem' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Keywords Section */}
                    <section className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h4 style={{ fontSize: '1.1rem', color: '#f59e0b' }}>🔑 실시간 알림 타겟 키워드 설정</h4>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(245,158,11,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#f59e0b', marginBottom: '0.3rem' }}>자동 감지 단어 (필수)</label>
                                    <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="예: 결합상품" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                                </div>
                                <div style={{ flex: 2, minWidth: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>함께 연결될 단어 (선택, 쉼표로 여러 개 입력)</label>
                                    <input type="text" value={newSubKeyword} onChange={e => setNewSubKeyword(e.target.value)} placeholder="예: 할인, 해지" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                                </div>
                                <div style={{ flex: 2, minWidth: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#ef4444', marginBottom: '0.3rem' }}>제외 단어 (선택, 쉼표 구분)</label>
                                    <input type="text" value={newExcludeKeyword} onChange={e => setNewExcludeKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} placeholder="예: 광고, 무관" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: '100px' }}>
                                    <button onClick={addKeyword} className={styles.editBtn} disabled={!newKeyword.trim()} style={{ background: '#f59e0b', color: 'black', fontWeight: 'bold', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}><Plus size={18} style={{ marginRight: '4px' }} />등록</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {keywords.map(kw => (
                                <div key={kw.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.9rem' }}>
                                    {kw.keyword.replace(/\+/g, ' ➕ ')}
                                    <button onClick={() => removeKeyword(kw.id)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
                
                <section className="glass-panel" style={{ padding: '2rem', marginTop: '2rem', border: '1px dashed rgba(245,158,11,0.5)' }}>
                    <h4 style={{ fontSize: '1.1rem', color: '#f59e0b', marginBottom: '1rem' }}>⚙️ 크론 작업 (Cron Job) 설정 안내</h4>
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>
                        이 실시간 시스템은 서버리스 환경(Vercel)의 콜드 스타트 문제를 피해 5~10분 주기로 안정적으로 동작하기 위해 <strong>외부 무료 크론 서비스</strong>(예: cron-job.org) 연동이 필요합니다.<br/><br/>
                        <strong>설정 방법:</strong><br/>
                        1. cron-job.org 에 접속하여 회원가입 후 로그인합니다.<br/>
                        2. "Create Cronjob" 메뉴에서 URL에 <code>https://현재도메인/api/scraper/keyword-alert</code> 을 입력합니다.<br/>
                        3. 실행 주기(Schedule)를 <strong>5분</strong> 또는 <strong>10분</strong>으로 설정합니다.<br/>
                        4. Method는 <code>POST</code> 로 설정하고 저장합니다.<br/>
                        이렇게 설정해두면 주기적으로 시스템이 깨어나 키워드를 감지하고 텔레그램(긴급방)으로 발송합니다.
                    </p>
                </section>
            </main>
        </div>
    );
}
