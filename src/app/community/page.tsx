'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, MonitorPlay, Youtube, Globe, Settings, LayoutDashboard, Plus, Trash2, ArrowLeft, Download, ShieldAlert, Activity } from 'lucide-react';
import styles from '../page.module.css';

export default function CommunityDashboard() {
    const [currentView, setCurrentView] = useState<'dashboard' | 'settings'>('dashboard');
    const [posts, setPosts] = useState<any[]>([]);
    const [targets, setTargets] = useState<any[]>([]);
    const [keywords, setKeywords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<number | null>(null);

    const [newSiteName, setNewSiteName] = useState('');
    const [newTargetUrl, setNewTargetUrl] = useState('');
    const [newKeyword, setNewKeyword] = useState('');
    const [filterTarget, setFilterTarget] = useState<string>('ALL');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [pRes, tRes, kRes] = await Promise.all([
                fetch('/api/community/posts', { cache: 'no-store' }),
                fetch('/api/community/targets', { cache: 'no-store' }),
                fetch('/api/community/keywords', { cache: 'no-store' })
            ]);

            const pData = await pRes.json();
            const tData = await tRes.json();
            const kData = await kRes.json();

            setPosts(Array.isArray(pData) ? pData : []);
            setTargets(Array.isArray(tData) ? tData : []);
            setKeywords(Array.isArray(kData) ? kData : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleScrape = async (silent = false) => {
        if (!silent) setScraping(true);
        try {
            await fetch('/api/scraper/community', { method: 'POST' });
            await fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            if (!silent) setScraping(false);
        }
    };

    useEffect(() => {
        fetchData();
        handleScrape(true);
    }, [currentView]);

    const addTarget = async () => {
        if (!newSiteName || !newTargetUrl) return;
        await fetch('/api/community/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteName: newSiteName, url: newTargetUrl })
        });
        setNewSiteName('');
        setNewTargetUrl('');
        fetchData();
    };

    const removeTarget = async (id: number) => {
        await fetch('/api/community/targets', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchData();
    };

    const addKeyword = async () => {
        if (!newKeyword.trim()) return;
        await fetch('/api/community/keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: newKeyword.trim() })
        });
        setNewKeyword('');
        fetchData();
    };

    const removeKeyword = async (id: number) => {
        await fetch('/api/community/keywords', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchData();
    };

    const handleAnalyze = async (id: number) => {
        setAnalyzingId(id);
        try {
            const res = await fetch('/api/scraper/community/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.error) alert('분석 실패: ' + data.error);
            else fetchData();
        } catch (e) {
            alert('분석 중 오류 발생');
        } finally {
            setAnalyzingId(null);
        }
    };

    const filteredPosts = posts.filter(p => filterTarget === 'ALL' || p.targetId.toString() === filterTarget);

    const Sidebar = () => (
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
                        <a href="#" className={`${styles.navItem} ${currentView === 'dashboard' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('dashboard'); }}>
                            <Activity size={18} /> 모니터링 동향
                        </a>
                        <a href="#" className={`${styles.navItem} ${currentView === 'settings' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('settings'); }}>
                            <Settings size={18} /> 커뮤니티 설정
                        </a>
                    </div>
                </div>
            </nav>
        </aside>
    );

    if (currentView === 'settings') {
        return (
            <div className={styles.container}>
                <Sidebar />
                <main className={styles.main}>
                    <header className={`animate-fade-in ${styles.header}`}>
                        <div>
                            <h2 className={styles.pageTitle} style={{ marginTop: '0.5rem' }}>⚙️ 커뮤니티 타겟 & 로직 관리</h2>
                            <p className={styles.subtitle} style={{ margin: 0, marginTop: '0.5rem' }}>커뮤니티 전용 파싱 엔진, 대상 사이트 및 키워드 설정</p>
                        </div>
                    </header>

                    <div className={styles.configGrid}>
                        <section className="glass-panel" style={{ padding: '2rem' }}>
                            <h3 style={{ marginBottom: '1.5rem', color: '#10b981', display: 'flex', alignItems: 'center' }}>
                                <Globe size={20} style={{ marginRight: '8px' }} />
                                수집 타겟 사이트 관리
                            </h3>
                            <div className={styles.configItem}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '1rem', width: '100%' }}>
                                    <input type="text" placeholder="사이트명 (예: 디시인사이드)" value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} className={styles.inputField} />
                                    <input type="text" placeholder="모니터링 대상 주소 (URL)" value={newTargetUrl} onChange={(e) => setNewTargetUrl(e.target.value)} className={styles.inputField} />
                                    <button onClick={addTarget} className={styles.editBtn} style={{ background: 'var(--accent-brand)', color: 'white', display: 'flex', alignItems: 'center' }}><Plus size={18} /> 추가</button>
                                </div>
                            </div>

                            <div style={{ marginTop: '2rem' }}>
                                <h4>현재 등록된 타겟 ({targets.length}개)</h4>
                                <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
                                    {targets.map(t => (
                                        <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', marginBottom: '0.8rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div>
                                                <strong style={{ color: '#10b981', display: 'inline-block', width: '150px' }}>{t.siteName}</strong>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t.url}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                {t.lastScrapedAt && (
                                                    <span style={{ fontSize: '0.85rem', color: t.lastScrapeStatus === 'ERROR' ? '#ef4444' : '#10b981' }}>
                                                        {t.lastScrapeStatus}
                                                    </span>
                                                )}
                                                <button onClick={() => removeTarget(t.id)} className={styles.deleteBtn}><Trash2 size={16} /></button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>

                        <section className="glass-panel" style={{ padding: '2rem' }}>
                            <h3 style={{ marginBottom: '1.5rem', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                                <ShieldAlert size={20} style={{ marginRight: '8px' }} />
                                커뮤니티 전용 키워드 관리
                            </h3>
                            <div className={styles.configItem}>
                                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                    <input type="text" placeholder="감시할 키워드 (예: 망사용료)" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} className={styles.inputField} style={{ flex: 1 }} />
                                    <button onClick={addKeyword} className={styles.editBtn} style={{ background: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center' }}><Plus size={18} /> 추가</button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                                {keywords.map(kw => (
                                    <span key={kw.id} className={styles.keywordTag} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        #{kw.keyword}
                                        <button onClick={() => removeKeyword(kw.id)} style={{ background: 'none', border: 'none', color: 'inherit', marginLeft: '6px', cursor: 'pointer', padding: 0 }}><Trash2 size={12} /></button>
                                    </span>
                                ))}
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <Sidebar />
            <main className={styles.main}>
                <header className={`animate-fade-in ${styles.header}`}>
                    <div>
                        <h2 className={styles.pageTitle}>블로그/커뮤니티 모니터링</h2>
                        <p className={styles.subtitle} style={{ margin: 0, marginTop: '0.5rem' }}>텍스트 기반의 여론 및 주요 커뮤니티 전파 상황 추적</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={() => handleScrape(false)} disabled={scraping} className={styles.scrapeBtn} style={{ background: '#10b981' }}>
                            <RefreshCw size={18} className={scraping ? styles.spin : ''} />
                            {scraping ? '수집 중...' : '새로고침 (데이터 연동)'}
                        </button>
                    </div>
                </header>

                <section style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <select value={filterTarget} onChange={e => setFilterTarget(e.target.value)} className={styles.inputField} style={{ width: '200px' }}>
                        <option value="ALL">전체 타겟</option>
                        {targets.map(t => <option key={t.id} value={t.id.toString()}>{t.siteName}</option>)}
                    </select>
                </section>

                <div className={styles.grid}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>로딩 중...</div>
                    ) : filteredPosts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>수집된 게시글이 없습니다. '새로고침'을 누르세요.</div>
                    ) : (
                        filteredPosts.map((post) => (
                            <article key={post.id} className={`glass-panel ${styles.card} animate-fade-in`}>
                                <div className={styles.cardHeader} style={{ flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', marginBottom: '1rem' }}>
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            backgroundColor: post.aiRiskLevel === '상' ? '#ef4444' : post.aiRiskLevel === '중' ? '#f59e0b' : post.aiRiskLevel === '하' ? '#10b981' : '#6b7280',
                                            boxShadow: `0 0 10px ${post.aiRiskLevel === '상' ? '#ef4444' : post.aiRiskLevel === '중' ? '#f59e0b' : post.aiRiskLevel === '하' ? '#10b981' : 'transparent'}`
                                        }} />
                                        <span className={styles.channelLabel} style={{ background: '#10b981', color: 'black' }}>{post.target?.siteName || '커뮤니티'}</span>
                                        {post.isAiRecommended && <span className={styles.isRecommendedBadge} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>키워드 감지</span>}
                                    </div>
                                    <h3 className={styles.programTitle} style={{ fontSize: '1.1rem', width: '100%' }}>{post.title}</h3>
                                </div>

                                <div className={styles.cardContent}>
                                    <div className={styles.metaInfo}>
                                        <span>작성자: {post.author}</span>
                                        <span>게시일: {new Date(post.publishedAt).toLocaleDateString()}</span>
                                    </div>

                                    {post.aiSummary && (
                                        <div style={{
                                            background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', padding: '1rem', marginTop: '1rem', border: '1px solid rgba(16, 185, 129, 0.1)'
                                        }}>
                                            <p style={{ fontSize: '0.8rem', color: '#10b981', marginBottom: '0.5rem', fontWeight: 600 }}>✨ 경영진 요약 리포트</p>
                                            <p className={styles.aiText} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{post.aiSummary}</p>
                                        </div>
                                    )}

                                    {!post.aiSummary && (
                                        <p style={{ marginTop: '0.8rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {post.content}
                                        </p>
                                    )}
                                </div>

                                <div className={styles.cardFooter}>
                                    <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>원문 보기</a>
                                    <button
                                        onClick={() => handleAnalyze(post.id)}
                                        disabled={analyzingId === post.id}
                                        className={styles.editBtn}
                                        style={{ background: '#10b981', color: '#000', opacity: analyzingId === post.id ? 0.5 : 1 }}
                                    >
                                        {analyzingId === post.id ? '분석 중...' : 'AI 위험도 진단'}
                                    </button>
                                </div>
                            </article>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
