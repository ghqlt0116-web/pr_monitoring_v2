'use client';
import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, ScreenShare, ShieldAlert, MonitorPlay, Activity, Clock, Save } from 'lucide-react';
import styles from './page.module.css';

export default function Dashboard() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'risk' | 'settings'>('dashboard');
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Settings State
  const [highKeywords, setHighKeywords] = useState<string>('');
  const [midKeywords, setMidKeywords] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchEpisodes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/episodes');
      const data = await res.json();
      if (Array.isArray(data)) {
        const sortedData = data.sort((a: any, b: any) => {
          // 최신순 (방송예정일 기준 우선, 없으면 수집일 기준)
          const dateA = new Date(a.broadcastDate || a.scrapedAt).getTime();
          const dateB = new Date(b.broadcastDate || b.scrapedAt).getTime();
          return dateB - dateA;
        });
        setEpisodes(sortedData);
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
      const res = await fetch('/api/settings');
      const data = await res.json();
      setHighKeywords(data.highKeywords?.join(', ') || '');
      setMidKeywords(data.midKeywords?.join(', ') || '');
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchEpisodes();
    fetchSettings();
    
    // 자동 크롤링 주기 (6시간: 21600000ms)
    const interval = setInterval(() => {
      handleScrape();
    }, 21600000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    const payload = {
      highKeywords: highKeywords.split(',').map(s => s.trim()).filter(Boolean),
      midKeywords: midKeywords.split(',').map(s => s.trim()).filter(Boolean),
    };
    try {
      await fetch('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
      alert('설정이 성공적으로 저장되었습니다. 다음 스크래핑부터 이 키워드가 적용됩니다.');
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch('/api/scraper', { method: 'POST' });
      await fetchEpisodes(); // refresh list
    } catch (e) {
      console.error(e);
    } finally {
      setScraping(false);
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
            <MonitorPlay size={24} color="var(--accent-brand)" />
          </div>
          <h1>PR 모니터링</h1>
        </div>
        
        <nav className={styles.nav}>
          <a href="#" className={`${styles.navItem} ${currentView === 'dashboard' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('dashboard'); }}>
            <Activity size={20} /> 대시보드
          </a>
          <a href="#" className={`${styles.navItem} ${currentView === 'risk' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('risk'); }}>
             <ShieldAlert size={20} /> 리스크 관리
          </a>
          <a href="#" className={`${styles.navItem} ${currentView === 'settings' ? styles.active : ''}`} onClick={(e) => { e.preventDefault(); setCurrentView('settings'); }}>
             <ScreenShare size={20} /> 프로그램 설정
          </a>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className={styles.main}>
        <header className={`animate-fade-in ${styles.header}`}>
          <div>
            <h2 className={styles.pageTitle}>시사 프로그램 모니터링 현황</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
              <p className={styles.subtitle} style={{ margin: 0 }}>공중파/종편 리스크 실시간 추적 대시보드</p>
              {lastUpdated && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Clock size={14} /> 최근 업데이트: {lastUpdated.toLocaleString()}
                </span>
              )}
            </div>
          </div>
          
          <button 
            className={`${styles.scrapeBtn} ${scraping ? styles.spinning : ''}`}
            onClick={handleScrape}
            disabled={scraping}
          >
            <RefreshCw size={18} /> {scraping ? '수집 및 분석 중...' : '최신 데이터 갱신'}
          </button>
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
                   <h4 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', color: 'var(--accent-brand)' }}>📺 모니터링 채널 (Active)</h4>
                   <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                     <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><span>SBS 그것이 알고싶다</span> <span style={{ color: 'var(--risk-low)' }}>● 작동중</span></li>
                     <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><span>SBS 궁금한 이야기 Y</span> <span style={{ color: 'var(--risk-low)' }}>● 작동중</span></li>
                     <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><span>MBC PD수첩</span> <span style={{ color: 'var(--risk-low)' }}>● 작동중</span></li>
                     <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><span>MBC 탐사기획 스트레이트</span> <span style={{ color: 'var(--risk-low)' }}>● 작동중</span></li>
                     <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}><span>KBS 시사기획 창</span> <span style={{ color: 'var(--risk-low)' }}>● 작동중</span></li>
                     <li style={{ display: 'flex', justifyContent: 'space-between' }}><span>KBS 더 보다</span> <span style={{ color: 'var(--risk-low)' }}>● 작동중</span></li>
                   </ul>
                </div>
                
                <div className="glass-panel" style={{ padding: '2rem' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                     <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-brand)' }}>🔑 리스크 감지 타겟 키워드</h4>
                     <button className={styles.editBtn} onClick={handleSaveSettings} disabled={savingSettings}>
                       <Save size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> 
                       {savingSettings ? '저장 중...' : '확인 및 갱신'}
                     </button>
                   </div>
                   
                   <h5 style={{ color: 'var(--risk-high)', marginBottom: '0.5rem' }}>위험도 [상] 단어 리스트 (쉼표로 구분)</h5>
                   <textarea 
                     value={highKeywords}
                     onChange={(e) => setHighKeywords(e.target.value)}
                     className={styles.settingsInput}
                     style={{ width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem', resize: 'vertical' }}
                   />
                   
                   <h5 style={{ color: 'var(--risk-mid)', marginBottom: '0.5rem' }}>위험도 [중] 단어 리스트 (쉼표로 구분)</h5>
                   <textarea 
                     value={midKeywords}
                     onChange={(e) => setMidKeywords(e.target.value)}
                     className={styles.settingsInput}
                     style={{ width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', resize: 'vertical' }}
                   />
                </div>
             </div>
           </section>
        )}
      </main>
    </div>
  );
}
