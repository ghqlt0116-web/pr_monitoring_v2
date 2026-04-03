'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, AlertTriangle, ScreenShare, ShieldAlert, MonitorPlay, Activity, Clock, Save, Youtube, Globe, LayoutDashboard, Plus, X } from 'lucide-react';
import styles from './page.module.css';

export default function Dashboard() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'risk' | 'settings'>('dashboard');
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [programs, setPrograms] = useState<any[]>([]);

  // Settings State
  const [highKeywords, setHighKeywords] = useState<string[]>([]);
  const [newHighKeyword, setNewHighKeyword] = useState('');
  const [newHighSubKeyword, setNewHighSubKeyword] = useState('');
  const [midKeywords, setMidKeywords] = useState<string[]>([]);
  const [newMidKeyword, setNewMidKeyword] = useState('');
  const [newMidSubKeyword, setNewMidSubKeyword] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const handleAddHigh = () => {
    const main = newHighKeyword.trim();
    if (!main) return;

    const subs = newHighSubKeyword.split(',').map(s => s.trim()).filter(s => s);
    let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}`) : [main];
    newItems = newItems.filter(item => !highKeywords.includes(item));

    if (newItems.length > 0) {
      const newList = [...highKeywords, ...newItems];
      setHighKeywords(newList);
      setNewHighKeyword('');
      setNewHighSubKeyword('');
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
    let newItems = subs.length > 0 ? subs.map(sub => `${main}+${sub}`) : [main];
    newItems = newItems.filter(item => !midKeywords.includes(item));

    if (newItems.length > 0) {
      const newList = [...midKeywords, ...newItems];
      setMidKeywords(newList);
      setNewMidKeyword('');
      setNewMidSubKeyword('');
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
        setLastUpdated(new Date());
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
      setPrograms(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchEpisodes();
    fetchSettings();
    fetchPrograms();

    // 접속 시 백그라운드로 자동 스크래핑 시도 (서버에서 5시간 쿨타임으로 방어됨)
    handleScrape(true);
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
              <a href="#" className={`${styles.navItem} ${currentView === 'risk' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('risk'); }}>
                <ShieldAlert size={18} /> 리스크 관리
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
                <span><Globe size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} color="#10b981" />외부 커뮤니티</span>
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
              <RefreshCw size={18} /> {scraping ? '수집 및 분석 중...' : '최신 데이터 갱신'}
            </button>
          </div>
        </header>

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
                  <span className={styles.filterChip}>전체보기</span>
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
                          <button className={styles.editBtn}>수정</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {currentView === 'risk' && (
          <section className={`animate-fade-in ${styles.listSection}`}>
            <div className={styles.listHeader}>
              <h3>위험도(상/중) 집중 관리</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>통신, 망사용료, SK 관련 키워드가 포함된 에피소드만 필터링하여 보여줍니다.</p>
            </div>
            <div className={styles.grid} style={{ marginTop: '1rem' }}>
              {episodes.filter(e => e.riskLevel === '상' || e.riskLevel === '중').map(ep => (
                <article key={ep.id} className={`glass-panel ${styles.card}`} style={{ border: `1px solid ${getRiskColor(ep.riskLevel)}` }}>
                  <div className={styles.cardHeader}>
                    <span className={styles.channelLabel}>{ep.program?.channel}</span>
                    <span className={styles.programTitle}>{ep.program?.title}</span>
                    <span className={styles.riskBadge} style={{ borderColor: getRiskColor(ep.riskLevel), color: getRiskColor(ep.riskLevel) }}>리스크 {ep.riskLevel}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <h4 className={styles.epTitle}>{ep.title}</h4>
                    <p className={styles.aiText} style={{ color: getRiskColor(ep.riskLevel), fontWeight: 600, margin: '1rem 0' }}>{ep.summary}</p>
                    <button className={styles.editBtn} style={{ background: 'var(--accent-brand)' }}>대응 현황 보고서 작성</button>
                  </div>
                </article>
              ))}
              {episodes.filter(e => e.riskLevel === '상' || e.riskLevel === '중').length === 0 && (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                  현재 감지된 고위험 시사 프로그램이 없습니다. 지속적으로 모니터링 중입니다.
                </div>
              )}
            </div>
          </section>
        )}

        {currentView === 'settings' && (
          <section className={`animate-fade-in ${styles.listSection}`}>
            <div className={styles.listHeader}>
              <h3>프로그램 및 키워드 설정</h3>
            </div>

            <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <h4 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', color: 'var(--accent-brand)' }}>📺 모니터링 채널 리스트</h4>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {programs.map(prog => (
                    <li key={prog.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                      <span>{prog.channel} {prog.title}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {prog.lastScrapedAt ? new Date(prog.lastScrapedAt).toLocaleString() : '수집 기록 없음'}
                        </span>
                        {prog.lastScrapeStatus === 'ERROR' ? (
                          <span title={prog.lastScrapeError || '오류'} style={{ color: 'var(--risk-high)', cursor: 'help', fontSize: '1.1rem' }}>🔴</span>
                        ) : prog.lastScrapeStatus === 'SUCCESS' ? (
                          <span title="정상" style={{ color: 'var(--risk-low)', fontSize: '1.1rem' }}>🟢</span>
                        ) : (
                          <span title="대기" style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>⚪</span>
                        )}
                      </div>
                    </li>
                  ))}
                  {programs.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>등록된 프로그램이 없습니다.</span>}
                </ul>
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
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button onClick={handleAddHigh} className={styles.editBtn} disabled={!newHighKeyword.trim()} style={{ background: 'var(--accent-brand)', color: 'white', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}><Plus size={18} style={{ marginRight: '4px' }} />등록</button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2.5rem' }}>
                  {highKeywords.map(kw => (
                    <div key={kw} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      {kw.replace(/\+/g, ' ➕ ')}
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
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button onClick={handleAddMid} className={styles.editBtn} disabled={!newMidKeyword.trim()} style={{ background: 'var(--risk-mid)', color: 'white', padding: '0.6rem 1.2rem', height: '38px', display: 'flex', alignItems: 'center' }}><Plus size={18} style={{ marginRight: '4px' }} />등록</button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {midKeywords.map(kw => (
                    <div key={kw} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(250, 204, 21, 0.15)', color: '#fde047', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500, border: '1px solid rgba(250, 204, 21, 0.3)' }}>
                      {kw.replace(/\+/g, ' ➕ ')}
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
