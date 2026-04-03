'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, MonitorPlay, Youtube, Globe, Settings, LayoutDashboard, Plus, Trash2, ArrowLeft, Download, ShieldAlert, Activity, Clock } from 'lucide-react';
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
        if (!confirm('해당 타겟을 삭제하시겠습니까? 관련 데이터는 유지됩니다.')) return;
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

    const handleExportExcel = () => {
        if (posts.length === 0) return;
        const csvRows = [
            ['게시일', '커뮤니티명', '작성자', '제목', '위험도', 'AI감지', 'AI리포트', '원문주소']
        ];
        posts.forEach(v => {
            const row = [
                new Date(v.publishedAt).toLocaleDateString(),
                v.target?.siteName || '커뮤니티',
                v.author || '',
                `"${v.title.replace(/"/g, '""')}"`,
                v.aiRiskLevel || '-',
                v.isAiRecommended ? 'O' : 'X',
                `"${(v.aiSummary || '').replace(/"/g, '""')}"`,
                v.url || ''
            ];
            csvRows.push(row);
        });
        const bom = "\uFEFF";
        const csvContent = bom + csvRows.map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `community_report_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredPosts = posts.filter(p => filterTarget === 'ALL' || p.targetId.toString() === filterTarget);

    const Sidebar = () => (
        <aside className={`glass-panel ${styles.sidebar}`}>
            <div className={styles.brand}>
                <div className={styles.logoBox}>
                    <LayoutDashboard size={24} color="#10b981" />
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
                        <span><Globe size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#10b981" />외부 커뮤니티</span>
                    </div>
                    <div className={styles.subNav}>
                        <a href="#" className={`${styles.navItem} ${currentView === 'dashboard' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('dashboard'); }}>
                            <Activity size={18} /> 모니터링 결과
                        </a>
                        <a href="#" className={`${styles.navItem} ${currentView === 'settings' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('settings'); }}>
                            <Settings size={18} /> 모니터링 설정
                        </a>
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
                        <h2 className={styles.pageTitle}>외부 커뮤니티 모니터링</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <p className={styles.subtitle} style={{ margin: 0 }}>주요 게시판 및 블로그 여론 및 리스크 실시간 트래킹</p>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Clock size={14} /> 6시간 자동 업데이트 | 최근 업데이트 자동 로드됨
                            </span>
                        </div>
                    </div>

                    {currentView === 'dashboard' && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                                className={`${styles.scrapeBtn} ${scraping ? styles.spinning : ''}`}
                                onClick={() => handleScrape(false)}
                                disabled={scraping}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <RefreshCw size={18} /> {scraping ? '데이터 수집 중...' : '최신 데이터 갱신'}
                            </button>
                            <button
                                className={styles.scrapeBtn}
                                onClick={handleExportExcel}
                                disabled={filteredPosts.length === 0}
                                style={{ background: '#10b981', color: 'white', whiteSpace: 'nowrap' }}
                                title="분석된 데이터를 CSV 엑셀 파일로 다운로드합니다"
                            >
                                <Download size={18} /> 엑셀 다운로드 (CSV)
                            </button>
                        </div>
                    )}
                </header>

                {currentView === 'dashboard' ? (
                    <>
                        <section style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <select value={filterTarget} onChange={e => setFilterTarget(e.target.value)} className={styles.settingsInput} style={{ width: '200px', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}>
                                <option value="ALL" style={{ color: 'black' }}>전체 타겟 통합보기</option>
                                {targets.map(t => <option key={t.id} value={t.id.toString()} style={{ color: 'black' }}>{t.siteName}</option>)}
                            </select>
                        </section>

                        <div className={styles.grid}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>로딩 중...</div>
                            ) : filteredPosts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>수집된 게시글이 없습니다. '최신 데이터 갱신'을 누르세요.</div>
                            ) : (
                                filteredPosts.map((post) => (
                                    <article key={post.id} className={`glass-panel ${styles.card} animate-fade-in`}>
                                        <div className={styles.cardHeader} style={{ flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', marginBottom: '1rem' }}>
                                                <div style={{
                                                    width: '8px', height: '8px', borderRadius: '50%',
                                                    backgroundColor: post.aiRiskLevel === '상' ? 'var(--risk-high)' : post.aiRiskLevel === '중' ? 'var(--risk-mid)' : post.aiRiskLevel === '하' ? 'var(--risk-low)' : '#6b7280',
                                                    boxShadow: `0 0 10px ${post.aiRiskLevel === '상' ? 'var(--risk-high)' : post.aiRiskLevel === '중' ? 'var(--risk-mid)' : post.aiRiskLevel === '하' ? 'var(--risk-low)' : 'transparent'}`
                                                }} />
                                                <span className={styles.channelLabel} style={{ background: '#10b981', color: 'black' }}>{post.target?.siteName || '커뮤니티'}</span>
                                                {post.isAiRecommended && <span className={styles.isRecommendedBadge} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>주요 키워드 감지</span>}
                                            </div>
                                            <h3 className={styles.programTitle} style={{ fontSize: '1.1rem', width: '100%' }}>{post.title}</h3>
                                        </div>

                                        <div className={styles.cardContent}>
                                            <div className={styles.metaInfo}>
                                                <span>작성자: {post.author}</span>
                                                <span>게시일: {new Date(post.publishedAt).toLocaleDateString()}</span>
                                            </div>

                                            {post.aiSummary ? (
                                                <div style={{
                                                    background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', padding: '1rem', marginTop: '1rem', border: '1px solid rgba(16, 185, 129, 0.1)'
                                                }}>
                                                    <p style={{ fontSize: '0.8rem', color: '#10b981', marginBottom: '0.5rem', fontWeight: 600 }}>✨ 경영진 리포트 (Risk: {post.aiRiskLevel})</p>
                                                    <p className={styles.aiText} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{post.aiSummary}</p>
                                                </div>
                                            ) : (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
                                                    <button
                                                        onClick={() => handleAnalyze(post.id)}
                                                        disabled={analyzingId === post.id}
                                                        className={styles.editBtn}
                                                        style={{ width: '100%', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid currentColor', textAlign: 'center' }}
                                                    >
                                                        {analyzingId === post.id ? 'AI 심층 리뷰 중...' : '심층 리뷰 (AI 분석 / 트래픽 비용발생)'}
                                                    </button>
                                                </div>
                                            )}

                                            {!post.aiSummary && (
                                                <p style={{ marginTop: '0.8rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {post.content}
                                                </p>
                                            )}
                                        </div>

                                        {post.url && (
                                            <div className={styles.cardFooter} style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                                <a href={post.url} target="_blank" rel="noopener noreferrer" className={styles.linkBtn} style={{ color: '#10b981' }}>외부 원문 출처 열기 ↗</a>
                                            </div>
                                        )}
                                    </article>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div className={styles.configGrid}>
                        {/* Target Sites Section */}
                        <section className="glass-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                <h4 style={{ fontSize: '1.1rem', color: '#10b981' }}>🌐 커뮤니티 파싱 타겟 등록</h4>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                <input
                                    type="text"
                                    placeholder="사이트 명칭 (예: 네이버 블로그)"
                                    value={newSiteName}
                                    onChange={(e) => setNewSiteName(e.target.value)}
                                    className={styles.settingsInput}
                                    style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                />
                                <input
                                    type="text"
                                    placeholder="타겟 URL 주소"
                                    value={newTargetUrl}
                                    onChange={(e) => setNewTargetUrl(e.target.value)}
                                    className={styles.settingsInput}
                                    style={{ flex: 2, padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                />
                                <button onClick={addTarget} className={styles.editBtn} style={{ background: 'var(--accent-brand)', padding: '0 1.5rem' }}><Plus size={18} /></button>
                            </div>

                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {targets.map(t => (
                                    <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                        <div>
                                            <strong style={{ color: '#10b981' }}>{t.siteName}</strong>
                                            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>URL: {t.url}</span>
                                            <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    {t.lastScrapedAt ? new Date(t.lastScrapedAt).toLocaleString() : '수집 기록 없음'}
                                                </span>
                                                {t.lastScrapeStatus === 'ERROR' ? (
                                                    <span title={t.lastScrapeError || '오류'} style={{ color: 'var(--risk-high)', cursor: 'help', fontSize: '0.9rem' }}>🔴</span>
                                                ) : t.lastScrapeStatus === 'SUCCESS' ? (
                                                    <span title="정상" style={{ color: 'var(--risk-low)', fontSize: '0.9rem' }}>🟢</span>
                                                ) : (
                                                    <span title="대기" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>⚪</span>
                                                )}
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
                                <h4 style={{ fontSize: '1.1rem', color: '#10b981' }}>🔑 자동 감지 타겟 키워드 설정</h4>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#10b981', marginBottom: '0.3rem' }}>자동 감지 단어 (필수)</label>
                                        <input
                                            type="text"
                                            value={newKeyword}
                                            onChange={e => setNewKeyword(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addKeyword()}
                                            placeholder="예: 망사용료"
                                            className={styles.settingsInput}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                        <button onClick={addKeyword} className={styles.editBtn} disabled={!newKeyword.trim()} style={{ background: '#10b981', color: 'white', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}>
                                            <Plus size={18} style={{ marginRight: '4px' }} />등록
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {keywords.map(kw => (
                                    <div key={kw.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.9rem' }}>
                                        #{kw.keyword}
                                        <button onClick={() => removeKeyword(kw.id)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}
