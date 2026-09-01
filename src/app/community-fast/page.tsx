'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MonitorPlay, Youtube, Globe, Settings, LayoutDashboard, Plus, Trash2, Activity, Clock } from 'lucide-react';
import styles from '../page.module.css';

export default function CommunityFastDashboard() {
    const [targets, setTargets] = useState<any[]>([]);
    const [keywords, setKeywords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [previewLoading, setPreviewLoading] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [previewSite, setPreviewSite] = useState<string | null>(null);
    const [previewSiteType, setPreviewSiteType] = useState<string | null>(null);

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

    const handlePreview = async (siteType: string, siteName: string) => {
        setPreviewLoading(siteType);
        setPreviewSite(siteName);
        setPreviewSiteType(siteType);
        setPreviewData([]);
        try {
            const res = await fetch(`/api/community-fast/preview?siteType=${siteType}`);
            const data = await res.json();
            if (data.error) {
                alert("불러오기 실패: " + data.error);
                setPreviewSite(null);
            } else if (data.isRelay) {
                setPreviewData([data]);
            } else {
                setPreviewData(Array.isArray(data) ? data : []);
            }
        } catch(e: any) {
            alert("통신 오류: " + e.message);
            setPreviewSite(null);
        } finally {
            setPreviewLoading(null);
        }
    };

    const addKeyword = async () => {
        const main = newKeyword.trim();
        if (!main) return;

        const subs = newSubKeyword.split(',').map(s => s.trim()).filter(s => s);
        const excludes = newExcludeKeyword.split(',').map(s => s.trim()).filter(s => s);

        const excludeStr = excludes.length > 0 ? '-' + excludes.join('-') : '';
        let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}${excludeStr}`) : [`${main}${excludeStr}`];

        let hasError = false;
        let errorMessage = "";
        for (const word of newItems) {
            try {
                const res = await fetch('/api/community-fast/keywords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keyword: word })
                });
                const data = await res.json();
                if (data.error && !data.error.includes('Unique constraint')) {
                    hasError = true;
                    errorMessage = data.error;
                }
            } catch (e: any) {
                hasError = true;
                errorMessage = e.message;
            }
        }

        if (hasError) {
            alert("키워드 추가 중 일부 실패: " + errorMessage);
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
                    <Link href="/community" replace style={{ textDecoration: 'none' }}>
                        <div className={styles.navGroupHeader}>
                            <span><Globe size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#10b981" />블로그 모니터링</span>
                        </div>
                    </Link>
                </div>

                <div className={styles.navGroup}>
                    <div className={`${styles.navGroupHeader} ${styles.activeNav}`}>
                        <span><Activity size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#f59e0b" />커뮤니티 모니터링</span>
                    </div>
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
                        <h2 className={styles.pageTitle}>실시간 커뮤니티 모니터링</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <p className={styles.subtitle} style={{ margin: 0 }}>실시간 타겟 키워드 감지 및 텔레그램 긴급 알림</p>
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
                            <h4 style={{ fontSize: '1.1rem', color: '#f59e0b', margin: 0 }}>🌐 실시간 모니터링 대상 (자동수집)</h4>
                        </div>

                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {[...targets].map(t => (
                                <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', minWidth: 0 }}>
                                    <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <strong style={{ color: '#f59e0b' }}>{t.siteName}</strong>
                                            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 5px #10b981' }} />
                                                실시간 모니터링 작동중
                                            </span>
                                            <button onClick={() => handlePreview(t.siteType, t.siteName)} disabled={previewLoading === t.siteType} style={{ marginLeft: 'auto', background: 'rgba(245,158,11,0.2)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '0.3rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>
                                                {previewLoading === t.siteType ? '불러오는 중...' : '👀 실시간 파싱 테스트'}
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                마지막 확인한 게시물 ID: {t.lastScrapedPostId || '없음'}
                                            </span>
                                            {t.siteType === 'RULIWEB' && (
                                                <span style={{ color: '#93c5fd', fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                                    💡 IP 차단 방지 GitHub 릴레이 수집 대상
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {previewSite && (
                            <div className="animate-fade-in" style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                    <h5 style={{ color: '#f59e0b', margin: 0, fontSize: '1rem' }}>📡 {previewSite} 수집 데이터 미리보기 (최근 10건)</h5>
                                    <button onClick={() => setPreviewSite(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>닫기 ✕</button>
                                </div>

                                {previewSiteType === 'RULIWEB' && (
                                    <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.8rem', color: '#93c5fd' }}>
                                        💡 루리웹은 웹 방화벽(IP 차단) 방지를 위해 <strong>GitHub Actions 릴레이로 수집된 최신 스냅샷(10건)</strong>을 표시합니다.
                                    </div>
                                )}

                                {previewData.length === 0 && previewLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1rem 0' }}>
                                        <div className={styles.spinner} style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                                        <span>해당 사이트의 HTML을 분석 중입니다...</span>
                                    </div>
                                ) : previewData.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>게시글을 가져오지 못했습니다.</p>
                                ) : (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        {previewData.map((p, i) => (
                                             <li key={i} style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)' }}>
                                                 <span style={{ color: '#f59e0b', marginRight: '0.5rem', display: 'inline-block', minWidth: '80px' }}>[ID: {p.id}]</span>
                                                 <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} className={styles.navItem}>{p.title}</a>
                                             </li>
                                         ))}
                                     </ul>
                                 )}
                            </div>
                        )}
                    </section>

                    {/* Keywords Section */}
                    <section className="glass-panel" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                            <h4 style={{ fontSize: '1.1rem', color: '#f59e0b', margin: 0 }}>🔑 실시간 알림 타겟 키워드 설정</h4>
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
            </main>
        </div>
    );
}
