'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Youtube, Settings, ArrowLeft, ShieldAlert, MonitorPlay, Activity, Clock, Trash2, Save, Plus, Globe, LayoutDashboard, Download } from 'lucide-react';
import styles from '../page.module.css';

export default function CreatorsDashboard() {
    const [currentView, setCurrentView] = useState<'dashboard' | 'settings'>('dashboard');
    const [videos, setVideos] = useState<any[]>([]);
    const [channels, setChannels] = useState<any[]>([]);
    const [keywords, setKeywords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [analyzingId, setAnalyzingId] = useState<string | null>(null);
    const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Form states
    const [newChannelId, setNewChannelId] = useState('');
    const [newChannelTier, setNewChannelTier] = useState<number>(3);
    const [newKeyword, setNewKeyword] = useState('');
    const [newSubKeyword, setNewSubKeyword] = useState('');

    const [filterChannel, setFilterChannel] = useState<string>('ALL');
    const [filterKeyword, setFilterKeyword] = useState<string>('ALL');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [vidRes, chRes, kwRes] = await Promise.all([
                fetch('/api/creators/videos', { cache: 'no-store' }),
                fetch('/api/creators/channels', { cache: 'no-store' }),
                fetch('/api/creators/keywords', { cache: 'no-store' })
            ]);
            const vidData = await vidRes.json();
            const chData = await chRes.json();
            const kwData = await kwRes.json();

            setVideos(Array.isArray(vidData) ? vidData : []);
            setChannels(Array.isArray(chData) ? chData : []);
            setKeywords(Array.isArray(kwData) ? kwData : []);
            setLastUpdated(new Date());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleScrape = async (silent = false) => {
        if (!silent) setScraping(true);
        try {
            await fetch('/api/scraper/youtube', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: !silent })
            });
            await fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            if (!silent) setScraping(false);
        }
    };

    useEffect(() => {
        fetchData();
        // 접속 시 백그라운드로 자동 스크래핑 (서버에서 5시간 쿨타임으로 방어)
        handleScrape(true);
    }, [currentView]);

    const filteredVideos = videos.filter(vid => {
        if (filterChannel !== 'ALL' && vid.channelId !== filterChannel) return false;

        if (filterKeyword !== 'ALL') {
            const spacelessVidTitle = vid.title?.toLowerCase().replace(/\s+/g, '') || '';
            const spacelessVidDesc = vid.description?.toLowerCase().replace(/\s+/g, '') || '';
            const spacelessSummary = vid.aiSummary?.toLowerCase().replace(/\s+/g, '') || '';
            const spacelessKeyword = filterKeyword.toLowerCase().replace(/\s+/g, '');

            if (!spacelessVidTitle.includes(spacelessKeyword) &&
                !spacelessVidDesc.includes(spacelessKeyword) &&
                !spacelessSummary.includes(spacelessKeyword)) {
                return false;
            }
        }
        return true;
    });

    const handleExportExcel = () => {
        if (!filteredVideos || filteredVideos.length === 0) {
            alert("다운로드할 데이터가 없습니다.");
            return;
        }

        const headers = ['영상 제목', '업로드 일시', 'AI 리스크 등급', 'AI 심층 리뷰 요약', '영상 링크'];
        const rows = filteredVideos.map(vid => {
            const riskLevel = vid.aiRiskLevel || '분석 전';
            const summary = vid.aiSummary || '분석 전';

            return [
                `"${vid.title.replace(/"/g, '""')}"`,
                `"${new Date(vid.publishedAt).toLocaleString()}"`,
                `"${riskLevel}"`,
                `"${summary.replace(/"/g, '""')}"`,
                `"${vid.url}"`
            ];
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `SKB_유튜버_모니터링_리포트_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const handleAnalyze = async (videoId: string) => {
        setAnalyzingId(videoId);
        try {
            const res = await fetch('/api/scraper/youtube/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId })
            });
            const data = await res.json();
            if (data.error) {
                alert('분석 실패: ' + data.error);
            } else {
                await fetchData(); // refresh to show analysis result
            }
        } catch (e) {
            console.error(e);
            alert('분석 중 오류 발생');
        } finally {
            setAnalyzingId(null);
        }
    };

    const addChannel = async () => {
        if (!newChannelId) return;
        const res = await fetch('/api/creators/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ youtubeId: newChannelId, tier: newChannelTier })
        });
        const data = await res.json();
        if (data.error) {
            console.error("채널 추가 실패: " + data.error);
        } else {
            setNewChannelId('');
            setNewChannelTier(3);
            fetchData();
        }
    };

    const updateChannelTier = async (id: string, newTier: number) => {
        await fetch('/api/creators/channels', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, tier: newTier })
        });
        fetchData();
    };

    const removeChannel = async (id: string) => {
        await fetch('/api/creators/channels', {
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
        let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}`) : [main];

        let hasError = false;
        for (const word of newItems) {
            const res = await fetch('/api/creators/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: word })
            });
            const data = await res.json();
            if (data.error && !data.error.includes('Unique constraint')) {
                hasError = true;
                console.error(data.error);
            }
        }

        if (hasError) {
            console.error("일부 키워드 추가 실패. 로그를 확인하세요.");
        } else {
            setNewKeyword('');
            setNewSubKeyword('');
            fetchData();
        }
    };

    const removeKeyword = async (id: string) => {
        await fetch('/api/creators/keywords', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        fetchData();
    };

    const getRiskColor = (level: string) => {
        switch (level) {
            case '상': return 'var(--risk-high)';
            case '중': return 'var(--risk-mid)';
            case '하': return 'var(--risk-low)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <div className={styles.container}>
            {/* Sidebar */}
            <aside className={`glass-panel ${styles.sidebar}`}>
                <div className={styles.brand}>
                    <div className={styles.logoBox}>
                        <LayoutDashboard size={24} color="#ef4444" />
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
                        <div className={`${styles.navGroupHeader} ${styles.activeNav}`}>
                            <span><Youtube size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#ef4444" />유튜버 모니터링</span>
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

                    <div className={styles.navGroup}>
                        <Link href="/community" replace style={{ textDecoration: 'none' }}>
                            <div className={styles.navGroupHeader}>
                                <span><Globe size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#10b981" />외부 커뮤니티</span>
                            </div>
                        </Link>
                    </div>
                </nav>
            </aside>

            {/* Main Content Areas */}
            <main className={styles.main}>
                <header className={`animate-fade-in ${styles.header}`}>
                    <div>
                        <h2 className={styles.pageTitle}>유튜버 모니터링</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <p className={styles.subtitle} style={{ margin: 0 }}>유튜버 영상 리스크 실시간 추적 대시보드</p>
                            {lastUpdated && (
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Clock size={14} /> 6시간 자동 업데이트 | 최근 업데이트: {lastUpdated.toLocaleString()}
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                            className={`${styles.scrapeBtn} ${scraping ? styles.spinning : ''}`}
                            onClick={() => handleScrape(false)}
                            disabled={scraping}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            <RefreshCw size={18} /> {scraping ? '수집 중...' : '최신 데이터 갱신'}
                        </button>
                        <button
                            className={styles.scrapeBtn}
                            onClick={handleExportExcel}
                            disabled={filteredVideos.length === 0}
                            style={{ background: '#10b981', color: 'white', whiteSpace: 'nowrap' }}
                            title="분석된 데이터를 CSV 엑셀 파일로 다운로드합니다"
                        >
                            <Download size={18} /> 엑셀 다운로드 (CSV)
                        </button>
                    </div>
                </header>

                {currentView === 'dashboard' && (
                    <section className={`animate-fade-in stagger-2 ${styles.listSection}`}>
                        <div className={styles.listHeader}>
                            <h3>최신 업로드 영상 리스트</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                🟢마크가 있는 영상은 우리 이슈와 연관 가능성이 높습니다. 의심되는 영상을 클릭해 심층 분석하세요.
                            </p>
                        </div>

                        {/* 🟢 다이나믹 필터 (다운드롭) */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', marginTop: '1rem' }}>
                            <select
                                value={filterChannel}
                                onChange={(e) => setFilterChannel(e.target.value)}
                                className={styles.settingsInput}
                                style={{ padding: '0.8rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', flex: 1, outline: 'none' }}
                            >
                                <option value="ALL" style={{ color: 'black' }}>📺 [전체 뷰] 모든 모니터링 채널</option>
                                {[...channels].sort((a, b) => a.title.localeCompare(b.title, 'ko-KR')).map(ch => (
                                    <option key={ch.id} value={ch.id} style={{ color: 'black' }}>[Tier {ch.tier || 3}] {ch.title}</option>
                                ))}
                            </select>

                            <select
                                value={filterKeyword}
                                onChange={(e) => setFilterKeyword(e.target.value)}
                                className={styles.settingsInput}
                                style={{ padding: '0.8rem 1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', flex: 1, outline: 'none' }}
                            >
                                <option value="ALL" style={{ color: 'black' }}>🔑 [전체 뷰] 모든 키워드 영상 보기</option>
                                {[...keywords].filter(k => k.isActive).sort((a, b) => a.keyword.localeCompare(b.keyword, 'ko-KR')).map(kw => (
                                    <option key={kw.keyword} value={kw.keyword} style={{ color: 'black' }}>{kw.keyword}</option>
                                ))}
                            </select>
                        </div>

                        {loading ? (
                            <div className={styles.loadingState}>
                                <div className={styles.spinner} />
                                <p>데이터를 불러오는 중입니다...</p>
                            </div>
                        ) : (
                            <div className={styles.grid}>
                                {filteredVideos.map((vid, idx) => (
                                    <article key={vid.id} className={`glass-panel animate-fade-in ${styles.card}`} style={{ animationDelay: `${0.1 * (idx % 5)}s` }}>
                                        <div className={styles.cardHeader} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className={styles.channelLabel} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>
                                                [Tier {vid.channel?.tier || 3}] {vid.channel?.title || 'Unknown'}
                                            </span>
                                            {vid.isAiRecommended && (() => {
                                                // 프론트엔드에서 실시간으로 어떤 키워드가 감지되었는지 찾기
                                                const spacelessText = (vid.title + ' ' + (vid.description || '')).toLowerCase().replace(/\s+/g, '');
                                                const matched = keywords.filter(k => k.isActive).map(k => k.keyword).filter(k => {
                                                    const subKws = k.split('+');
                                                    return subKws.every((sub: string) => spacelessText.includes(sub.toLowerCase().replace(/\s+/g, '')));
                                                });
                                                return (
                                                    <span className={styles.riskBadge} style={{ borderColor: '#10b981', color: '#10b981', whiteSpace: 'nowrap' }}>
                                                        🟢 키워드 감지: {matched.length > 0 ? matched.join(', ') : '기본 키워드'}
                                                    </span>
                                                );
                                            })()}
                                            {!vid.isAiRecommended && (
                                                <span className={styles.riskBadge} style={{ borderColor: 'var(--text-muted)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title="자막 미제공 또는 키워드 미감지 영상입니다. 썸네일/제목이 의심될 경우 클릭하여 강제 분석하세요">
                                                    ⚪ 키워드 미감지
                                                </span>
                                            )}
                                        </div>

                                        {vid.thumbnail && (
                                            <div className={styles.imageWrapper}>
                                                <img src={vid.thumbnail} alt={vid.title} loading="lazy" />
                                            </div>
                                        )}

                                        <div className={styles.cardBody}>
                                            <h4 className={styles.epTitle}>{vid.title}</h4>
                                            <p className={styles.epDate}>{new Date(vid.publishedAt).toLocaleString()}</p>

                                            {/* Track B Analysis Result Box */}
                                            {vid.aiSummary ? (
                                                <div className={styles.aiSummaryBox} style={{ borderColor: getRiskColor(vid.aiRiskLevel || ''), background: 'rgba(0,0,0,0.3)' }}>
                                                    <div className={styles.aiHeader} style={{ position: 'relative' }}>
                                                        <span style={{ color: getRiskColor(vid.aiRiskLevel || '') }}>AI 심층 분석 리포트 (리스크 {vid.aiRiskLevel})</span>
                                                        <button
                                                            onClick={() => handleAnalyze(vid.videoId)}
                                                            disabled={analyzingId === vid.videoId}
                                                            style={{ position: 'absolute', right: 0, top: 0, background: 'transparent', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '4px', color: '#10b981', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                                                            title="최신 댓글 기준으로 AI 보고서를 처음부터 새롭게 다시 작성합니다"
                                                        >
                                                            {analyzingId === vid.videoId ? '분석 중...' : '🔄 AI 재분석'}
                                                        </button>
                                                    </div>

                                                    <div style={{ position: 'relative' }}>
                                                        <div style={{
                                                            maxHeight: expandedSummaryId === vid.videoId ? 'none' : '100px',
                                                            overflow: 'hidden',
                                                            position: 'relative'
                                                        }}>
                                                            <p className={styles.aiText} style={{ marginBottom: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{vid.aiSummary}</p>
                                                        </div>
                                                        {expandedSummaryId !== vid.videoId && (
                                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, #111)', pointerEvents: 'none' }} />
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
                                                        <small style={{ color: 'var(--text-muted)' }}>분석일시: {new Date(vid.aiAnalyzedAt).toLocaleString()}</small>
                                                        <button
                                                            onClick={() => setExpandedSummaryId(expandedSummaryId === vid.videoId ? null : vid.videoId)}
                                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '0.3rem 0.7rem', color: 'white', fontSize: '0.85rem', cursor: 'pointer' }}
                                                        >
                                                            {expandedSummaryId === vid.videoId ? '▲ 접기' : '▼ 전체 내용 보기'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
                                                    <button
                                                        onClick={() => handleAnalyze(vid.videoId)}
                                                        disabled={analyzingId === vid.videoId}
                                                        className={styles.editBtn}
                                                        style={{ width: '100%', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid currentColor', textAlign: 'center' }}
                                                    >
                                                        {analyzingId === vid.videoId ? 'AI 심층 리뷰 중...' : '심층 리뷰 (AI 분석 / 트래픽 비용발생)'}
                                                    </button>
                                                </div>
                                            )}

                                            <div className={styles.cardFooter} style={{ marginTop: '1.5rem' }}>
                                                <a href={vid.url} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                                                    유튜브 영상 보기
                                                </a>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {currentView === 'settings' && (
                    <section className={`animate-fade-in ${styles.listSection}`}>

                        <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
                            <div className="glass-panel" style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                    <h4 style={{ fontSize: '1.1rem', color: '#ef4444' }}>📺 모니터링 유튜버 채널 등록</h4>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                    <input
                                        className={styles.settingsInput}
                                        placeholder="채널 구글 ID (예: UC...)"
                                        value={newChannelId}
                                        onChange={e => setNewChannelId(e.target.value)}
                                        style={{ flex: 1, padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                                    />
                                    <select
                                        value={newChannelTier}
                                        onChange={(e) => setNewChannelTier(Number(e.target.value))}
                                        className={styles.settingsInput}
                                        style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                    >
                                        <option value={1} style={{ color: 'black' }}>Tier 1 (최상)</option>
                                        <option value={2} style={{ color: 'black' }}>Tier 2 (중요)</option>
                                        <option value={3} style={{ color: 'black' }}>Tier 3 (일반)</option>
                                    </select>
                                    <button onClick={addChannel} className={styles.editBtn} style={{ background: 'var(--accent-brand)' }}><Plus size={18} /></button>
                                </div>

                                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {channels.map(ch => (
                                        <li key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                            <div>
                                                <strong>{ch.title}</strong>
                                                <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {ch.youtubeId}</span>
                                                <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        {ch.lastScrapedAt ? new Date(ch.lastScrapedAt).toLocaleString() : '수집 기록 없음'}
                                                    </span>
                                                    {ch.lastScrapeStatus === 'ERROR' ? (
                                                        <span title={ch.lastScrapeError || '오류'} style={{ color: 'var(--risk-high)', cursor: 'help', fontSize: '0.9rem' }}>🔴</span>
                                                    ) : ch.lastScrapeStatus === 'SUCCESS' ? (
                                                        <span title="정상" style={{ color: 'var(--risk-low)', fontSize: '0.9rem' }}>🟢</span>
                                                    ) : (
                                                        <span title="대기" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>⚪</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <select
                                                    value={ch.tier || 3}
                                                    onChange={(e) => updateChannelTier(ch.id, Number(e.target.value))}
                                                    className={styles.settingsInput}
                                                    style={{ padding: '0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', outline: 'none', fontSize: '0.85rem' }}
                                                >
                                                    <option value={1} style={{ color: 'black' }}>Tier 1</option>
                                                    <option value={2} style={{ color: 'black' }}>Tier 2</option>
                                                    <option value={3} style={{ color: 'black' }}>Tier 3</option>
                                                </select>
                                                <button onClick={() => removeChannel(ch.id)} style={{ background: 'none', border: 'none', color: 'var(--risk-high)', cursor: 'pointer', padding: '0.5rem' }}><Trash2 size={16} /></button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="glass-panel" style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                    <h4 style={{ fontSize: '1.1rem', color: '#10b981' }}>🔑 자동 감지 타겟 키워드 설정</h4>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(16,185,129,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#10b981', marginBottom: '0.3rem' }}>자동 감지 단어 (필수)</label>
                                            <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="예: 망사용료" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>함께 연결될 단어 (선택, 쉼표로 여러 개 입력)</label>
                                            <input type="text" value={newSubKeyword} onChange={e => setNewSubKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKeyword()} placeholder="예: 분쟁, 통신사" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button onClick={addKeyword} className={styles.editBtn} disabled={!newKeyword.trim()} style={{ background: '#10b981', color: 'white', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}><Plus size={18} style={{ marginRight: '4px' }} />등록</button>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {keywords.map(kw => (
                                        <div key={kw.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.9rem' }}>
                                            {kw.keyword.replace(/\+/g, ' ➕ ')}
                                            <button onClick={() => removeKeyword(kw.id)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
