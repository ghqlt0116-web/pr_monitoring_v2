'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, AlertTriangle, ScreenShare, ShieldAlert, MonitorPlay, Activity, Clock, Save, Youtube, Globe, LayoutDashboard, Plus, X, CheckCircle2, AlertCircle, Ban, RotateCcw } from 'lucide-react';
import styles from './page.module.css';

export default function Dashboard() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings'>('dashboard');
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [programs, setPrograms] = useState<any[]>([]);
  const [dismissedStaleIds, setDismissedStaleIds] = useState<Set<string>>(new Set());

  // Settings State
  const [highKeywords, setHighKeywords] = useState<string[]>([]);
  const [newHighKeyword, setNewHighKeyword] = useState('');
  const [newHighSubKeyword, setNewHighSubKeyword] = useState('');
  const [newHighExcludeKeyword, setNewHighExcludeKeyword] = useState('');
  const [midKeywords, setMidKeywords] = useState<string[]>([]);
  const [newMidKeyword, setNewMidKeyword] = useState('');
  const [newMidSubKeyword, setNewMidSubKeyword] = useState('');
  const [newMidExcludeKeyword, setNewMidExcludeKeyword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const handleAddHigh = () => {
    const main = newHighKeyword.trim();
    if (!main) return;

    const subs = newHighSubKeyword.split(',').map(s => s.trim()).filter(s => s);
    const excludes = newHighExcludeKeyword.split(',').map(s => s.trim()).filter(s => s);
    const excludeStr = excludes.length > 0 ? '-' + excludes.join('-') : '';

    let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}${excludeStr}`) : [`${main}${excludeStr}`];
    newItems = newItems.filter(item => !highKeywords.includes(item));

    if (newItems.length > 0) {
      const newList = [...highKeywords, ...newItems];
      setHighKeywords(newList);
      setNewHighKeyword('');
      setNewHighSubKeyword('');
      setNewHighExcludeKeyword('');
      autoSaveSettings(newList, midKeywords);
    }
  };
  const handleRemoveHigh = (tag: string) => {
    const newList = highKeywords.filter(k => k !== tag);
    setHighKeywords(newList);
    autoSaveSettings(newList, midKeywords);
  };

  const handleAddMid = () => {
    const main = newMidKeyword.trim();
    if (!main) return;

    const subs = newMidSubKeyword.split(',').map(s => s.trim()).filter(s => s);
    const excludes = newMidExcludeKeyword.split(',').map(s => s.trim()).filter(s => s);
    const excludeStr = excludes.length > 0 ? '-' + excludes.join('-') : '';

    let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}${excludeStr}`) : [`${main}${excludeStr}`];
    newItems = newItems.filter(item => !midKeywords.includes(item));

    if (newItems.length > 0) {
      const newList = [...midKeywords, ...newItems];
      setMidKeywords(newList);
      setNewMidKeyword('');
      setNewMidSubKeyword('');
      setNewMidExcludeKeyword('');
      autoSaveSettings(highKeywords, newList);
    }
  };
  const handleRemoveMid = (tag: string) => {
    const newList = midKeywords.filter(k => k !== tag);
    setMidKeywords(newList);
    autoSaveSettings(highKeywords, newList);
  };

  const fetchEpisodes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/episodes', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) {
        const sortedData = data.sort((a: any, b: any) => {
          // 최신순 (방송예정일 기준 우선, 없으면 수집일 기준)
          const dateA = new Date(a.broadcastDate || a.scrapedAt).getTime();
          const dateB = new Date(b.broadcastDate || b.scrapedAt).getTime();
          return dateB - dateA;
        });

        // 프로그램 당 최신(1개)만 노출 필터링
        const seenPrograms = new Set();
        const filteredData = sortedData.filter((ep: any) => {
          if (seenPrograms.has(ep.programId)) return false;
          seenPrograms.add(ep.programId);
          return true;
        });

        setEpisodes(filteredData);
        // DB에 저장된 실제 크롤링 시점 계산
        const epTimestamps = filteredData.map((e: any) => e.scrapedAt ? new Date(e.scrapedAt).getTime() : 0).filter((t: number) => t > 0);
        if (epTimestamps.length > 0) {
          setLastUpdated(prev => {
            const maxEp = Math.max(...epTimestamps);
            return prev ? new Date(Math.max(prev.getTime(), maxEp)) : new Date(maxEp);
          });
        }
      } else {
        console.error('API Error:', data);
        setEpisodes([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      const data = await res.json();
      setHighKeywords(data.highKeywords || []);
      setMidKeywords(data.midKeywords || []);
    } catch (e) { console.error(e); }
  };

  const fetchPrograms = async () => {
    try {
      const res = await fetch('/api/programs', { cache: 'no-store' });
      const data = await res.json();
      const progList = Array.isArray(data) ? data : [];
      setPrograms(progList);

      // 프로그램들의 실제 마지막 스크랩 시점 반영
      const progTimestamps = progList.map((p: any) => p.lastScrapedAt ? new Date(p.lastScrapedAt).getTime() : 0).filter((t: number) => t > 0);
      if (progTimestamps.length > 0) {
        setLastUpdated(prev => {
          const maxProg = Math.max(...progTimestamps);
          return prev ? new Date(Math.max(prev.getTime(), maxProg)) : new Date(maxProg);
        });
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchEpisodes();
    fetchSettings();
    fetchPrograms();
  }, []);

  const autoSaveSettings = async (newHigh: string[], newMid: string[]) => {
    const payload = { highKeywords: newHigh, midKeywords: newMid };
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      fetchEpisodes(); // Refresh list to get new re-evaluations
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleProgram = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/programs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive })
      });
      if (res.ok) {
        await fetchPrograms();
        await fetchEpisodes();
      }
    } catch (e) {
      console.error('Toggle program error:', e);
    }
  };

  const handleScrape = async (silent = false) => {
    if (!silent) setScraping(true);
    try {
      await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: !silent })
      });
      await fetchEpisodes(); // refresh list
      await fetchPrograms(); // refresh status
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setScraping(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case '상': return 'var(--risk-high)';
      case '중': return 'var(--risk-mid)';
      case '하': return 'var(--risk-low)';
      default: return 'var(--text-muted)';
    }
  };

  const highRiskCount = episodes.filter(e => e.riskLevel === '상').length;

  // 장기 미업데이트(30일 이상 미갱신, 종영 의심) 프로그램 필터링
  const staleCandidates = programs.filter(p => p.isActive && p.isStaleCandidate && !dismissedStaleIds.has(p.id));
  const activePrograms = programs.filter(p => p.isActive);
  const inactivePrograms = programs.filter(p => !p.isActive);

  return (
    <div className={styles.container}>
      {/* Sidebar Navigation */}
      <aside className={`glass-panel ${styles.sidebar}`}>
        <div className={styles.brand}>
          <div className={styles.logoBox}>
            <LayoutDashboard size={24} color="#3b82f6" />
          </div>
          <h1>SKB PR 모니터링</h1>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <div className={`${styles.navGroupHeader} ${styles.activeNav}`}>
              <span><MonitorPlay size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#3b82f6" />시사 프로그램 모니터링</span>
            </div>
            <div className={styles.subNav}>
              <a href="#" className={`${styles.navItem} ${currentView === 'dashboard' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('dashboard'); }}>
                <Activity size={18} /> 모니터링 결과
              </a>
              <a href="#" className={`${styles.navItem} ${currentView === 'settings' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('settings'); }}>
                <ScreenShare size={18} /> 모니터링 설정
              </a>
            </div>
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
            <Link href="/community-fast" replace style={{ textDecoration: 'none' }}>
              <div className={styles.navGroupHeader}>
                <span><Activity size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#f59e0b" />커뮤니티 모니터링</span>
              </div>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className={styles.main}>
        <header className={`animate-fade-in ${styles.header}`}>
          <div>
            <h2 className={styles.pageTitle}>시사 프로그램 모니터링</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
              <p className={styles.subtitle} style={{ margin: 0 }}>공중파/종편 리스크 실시간 추적 대시보드</p>
              {lastUpdated && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Clock size={14} /> 최근 업데이트: {lastUpdated.toLocaleString()}
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
              <RefreshCw size={18} /> {scraping ? '수집 및 분석 중...' : '최신 데이터 갱신'}
            </button>
          </div>
        </header>

        {/* 장기 미업데이트 / 종영 의심 프로그램 감지 알림 배너 */}
        {staleCandidates.length > 0 && currentView === 'dashboard' && (
          <section className="animate-fade-in" style={{
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(239, 68, 68, 0.08) 100%)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={22} color="#eab308" />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fef08a', margin: 0 }}>
                  장기 미업데이트 / 종영 의심 프로그램 감지 ({staleCandidates.length}건)
                </h3>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                30일 이상 신규 회차 미등록 시 자동 감지
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#fde047', lineHeight: 1.5 }}>
              아래 프로그램은 <strong>최근 30일 이상 새로운 회차가 등록되지 않았거나 이전 데이터가 반복</strong>되고 있습니다. 종영되었거나 장기 휴방 중인 경우 모니터링 목록에서 제외하시겠습니까?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {staleCandidates.map(prog => (
                <div key={prog.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.3)',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  flexWrap: 'wrap',
                  gap: '0.8rem'
                }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'white', marginRight: '0.5rem' }}>
                      [{prog.channel}] {prog.title}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#fca5a5' }}>
                      (마지막 방송/등록: {prog.staleDays}일 전 {prog.latestEpisodeDate ? `· ${new Date(prog.latestEpisodeDate).toLocaleDateString()}` : ''})
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleToggleProgram(prog.id, false)}
                      style={{
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <Ban size={14} /> 모니터링 제외하기
                    </button>
                    <button
                      onClick={() => setDismissedStaleIds(prev => new Set(prev).add(prog.id))}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)',
                        border: 'none',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                    >
                      유지하기
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {currentView === 'dashboard' && (
          <>
            {/* Stats Summary */}
            <section className={`animate-fade-in stagger-1 ${styles.statsGrid}`}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 className={styles.statLabel}>총 모니터링 영상</h3>
                <p className={styles.statValue}>{episodes.length}건</p>
              </div>
              <div className="glass-panel" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                <div className={styles.glowRed} />
                <h3 className={styles.statLabel}>리스크 [상] 발생</h3>
                <p className={styles.statValue} style={{ color: 'var(--risk-high)' }}>
                  {highRiskCount}건
                  {highRiskCount > 0 && <AlertTriangle size={24} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginLeft: '12px' }} />}
                </p>
              </div>
            </section>

            {/* List View */}
            <section className={`animate-fade-in stagger-2 ${styles.listSection}`}>
              <div className={styles.listHeader}>
                <h3>최근 수집 리스트</h3>
                <div className={styles.filters}>
                  <span className={styles.filterChip}>활성 프로그램 {activePrograms.length}개 대상</span>
                </div>
              </div>

              {loading ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner} />
                  <p>데이터를 불러오는 중입니다...</p>
                </div>
              ) : (
                <div className={styles.grid}>
                  {episodes.map((ep, idx) => (
                    <article key={ep.id} className={`glass-panel animate-fade-in ${styles.card}`} style={{ animationDelay: `${0.1 * (idx % 5)}s` }}>
                      <div className={styles.cardHeader}>
                        <span className={styles.channelLabel}>{ep.program?.channel}</span>
                        <span className={styles.programTitle}>{ep.program?.title}</span>
                        <span
                          className={styles.riskBadge}
                          style={{ borderColor: getRiskColor(ep.riskLevel), color: getRiskColor(ep.riskLevel) }}
                        >
                          리스크 {ep.riskLevel}
                        </span>
                      </div>

                      {ep.thumbnail && (
                        <div className={styles.imageWrapper}>
                          <img src={ep.thumbnail} alt={ep.title} loading="lazy" />
                        </div>
                      )}

                      <div className={styles.cardBody}>
                        <h4 className={styles.epTitle}>{ep.title}</h4>

                        <div className={styles.aiSummaryBox}>
                          <div className={styles.aiHeader}>
                            <span>🔍 키워드 감지 ({ep.category})</span>
                            {ep.isEdited && <span className={styles.editedTag}>수정됨</span>}
                          </div>
                          <p className={styles.aiText}>{ep.summary}</p>

                          {/* 원문 프리뷰 텍스트 일부 표시 */}
                          {ep.content && (
                            <p style={{ marginTop: '0.8rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {ep.content}
                            </p>
                          )}
                        </div>

                        <div className={styles.cardFooter}>
                          <a href={ep.originalUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                            원문 영상 보기
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                  {episodes.length === 0 && (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                      표시할 수집 데이터가 없습니다. 상단의 [최신 데이터 갱신] 버튼을 눌러보세요.
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {currentView === 'settings' && (
          <section className={`animate-fade-in ${styles.listSection}`}>
            <div className={styles.listHeader}>
              <h3>프로그램 및 키워드 설정</h3>
            </div>

            <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-brand)', margin: 0 }}>📺 모니터링 채널 관리</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>활성 {activePrograms.length}개 / 제외 {inactivePrograms.length}개</span>
                </div>

                <h5 style={{ color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '0.8rem' }}>🟢 활성 모니터링 프로그램</h5>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '2rem' }}>
                  {activePrograms.map(prog => (
                    <li key={prog.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      paddingBottom: '0.75rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 500 }}>{prog.channel} {prog.title}</span>
                          {prog.isStaleCandidate && (
                            <span style={{
                              fontSize: '0.72rem',
                              background: 'rgba(234, 179, 8, 0.2)',
                              color: '#fde047',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '12px',
                              border: '1px solid rgba(234, 179, 8, 0.4)'
                            }}>
                              🟡 {prog.staleDays}일 미갱신(종영의심)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          최근 수집: {prog.lastScrapedAt ? new Date(prog.lastScrapedAt).toLocaleString() : '기록 없음'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleToggleProgram(prog.id, false)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '0.35rem 0.7rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          제외하기
                        </button>
                      </div>
                    </li>
                  ))}
                  {activePrograms.length === 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>활성화된 프로그램이 없습니다.</span>
                  )}
                </ul>

                {inactivePrograms.length > 0 && (
                  <>
                    <h5 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.8rem' }}>⚪ 제외(종영)된 프로그램</h5>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {inactivePrograms.map(prog => (
                        <li key={prog.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          paddingBottom: '0.75rem',
                          opacity: 0.75
                        }}>
                          <div>
                            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{prog.channel} {prog.title}</span>
                            <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', color: '#94a3b8' }}>(모니터링 제외됨)</span>
                          </div>
                          <button
                            onClick={() => handleToggleProgram(prog.id, true)}
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#93c5fd',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              padding: '0.35rem 0.7rem',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <RotateCcw size={12} /> 다시 포함
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                  <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-brand)' }}>🔑 리스크 감지 타겟 키워드</h4>
                </div>

                <h5 style={{ color: 'var(--risk-high)', marginBottom: '0.5rem' }}>위험도 [상] 단어 리스트</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(239,68,68,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '0.3rem' }}>핵심 단어 (필수)</label>
                      <input type="text" value={newHighKeyword} onChange={e => setNewHighKeyword(e.target.value)} placeholder="예: 파업" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>함께 연결될 단어 (선택, 쉼표로 여러 개 입력)</label>
                      <input type="text" value={newHighSubKeyword} onChange={e => setNewHighSubKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddHigh()} placeholder="예: SK, 브로드밴드, 통신사" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '0.3rem' }}>제외 단어 (선택, 쉼표 구분)</label>
                      <input type="text" value={newHighExcludeKeyword} onChange={e => setNewHighExcludeKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddHigh()} placeholder="예: 시위, 임단협" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button onClick={handleAddHigh} className={styles.editBtn} disabled={!newHighKeyword.trim()} style={{ background: 'var(--accent-brand)', color: 'white', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}><Plus size={18} style={{ marginRight: '4px' }} />등록</button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2.5rem' }}>
                  {highKeywords.map(kw => (
                    <div key={kw} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      {kw.replace(/\+/g, ' ➕ ').replace(/-/g, ' (제외: ').replace(/(\(제외: .*)$/, '$1)')}
                      <button onClick={() => handleRemoveHigh(kw)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                    </div>
                  ))}
                  {highKeywords.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>등록된 키워드가 없습니다.</span>}
                </div>

                <h5 style={{ color: 'var(--risk-mid)', marginBottom: '0.5rem' }}>위험도 [중] 단어 리스트</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(250,204,21,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(250,204,21,0.2)' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fde047', marginBottom: '0.3rem' }}>핵심 단어 (필수)</label>
                      <input type="text" value={newMidKeyword} onChange={e => setNewMidKeyword(e.target.value)} placeholder="예: 해킹" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>함께 연결될 단어 (선택, 쉼표로 여러 개 입력)</label>
                      <input type="text" value={newMidSubKeyword} onChange={e => setNewMidSubKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMid()} placeholder="예: 고객정보, 유출" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fde047', marginBottom: '0.3rem' }}>제외 단어 (선택, 쉼표 구분)</label>
                      <input type="text" value={newMidExcludeKeyword} onChange={e => setNewMidExcludeKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMid()} placeholder="예: 무관, 광고" className={styles.settingsInput} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button onClick={handleAddMid} className={styles.editBtn} disabled={!newMidKeyword.trim()} style={{ background: 'var(--risk-mid)', color: 'white', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}><Plus size={18} style={{ marginRight: '4px' }} />등록</button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {midKeywords.map(kw => (
                    <div key={kw} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(250, 204, 21, 0.15)', color: '#fde047', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500, border: '1px solid rgba(250, 204, 21, 0.3)' }}>
                      {kw.replace(/\+/g, ' ➕ ').replace(/-/g, ' (제외: ').replace(/(\(제외: .*)$/, '$1)')}
                      <button onClick={() => handleRemoveMid(kw)} style={{ background: 'none', border: 'none', color: '#fde047', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                    </div>
                  ))}
                  {midKeywords.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>등록된 키워드가 없습니다.</span>}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
