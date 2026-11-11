import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, BookOpen, Code2, Keyboard, Play, RotateCcw, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import './style.css';

const PYTHON = ['NumPy','Pandas','Django','Flask','PyTorch','SciPy','FastAPI','Matplotlib','Requests','TensorFlow'];
const JAVASCRIPT = ['React','Vue','Express','Lodash','Next.js','Svelte','Angular'];
const JAVA = ['Spring','Hibernate','JUnit','Maven','Guava','Log4j'];
const ALL = [...PYTHON.map(label => ({label, kind:'python'})), ...JAVASCRIPT.map(label => ({label, kind:'javascript'})), ...JAVA.map(label => ({label, kind:'java'}))];
const GAME_SECONDS = 45;
const STORAGE_KEY = 'pycatch-leaderboard-v1';
const readScores = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };
const randomItem = () => {
  const pool = Math.random() < .48 ? ALL.slice(0, PYTHON.length) : ALL.slice(PYTHON.length);
  return {...pool[Math.floor(Math.random() * pool.length)], id: Math.random().toString(36).slice(2), x: 8 + Math.random() * 78, y: -12, speed: 19 + Math.random() * 8};
};

function App() {
  const [page, setPage] = useState('home');
  const [scores, setScores] = useState(readScores);
  const [game, setGame] = useState({time:GAME_SECONDS, score:0, caught:0, missed:0, x:50, items:[]});
  const [muted, setMuted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [hit, setHit] = useState(null);
  const [shake, setShake] = useState(false);
  const gameRef = useRef(game);
  const keys = useRef({left:false,right:false});
  const lastFrame = useRef(0);
  const spawnTime = useRef(0);
  const nameRef = useRef(null);
  const freezeUntil = useRef(0);
  const arenaRef = useRef(null);
  const hitTimer = useRef(null);
  const shakeTimer = useRef(null);
  const saved = useRef(false);
  const audioRef = useRef(null);
  gameRef.current = game;

  function sound(ok) {
    if (muted) return;
    try {
      const ctx = audioRef.current || (audioRef.current = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      const tone = (frequency, start, duration, type='sine') => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
        gain.gain.setValueAtTime(.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(ok ? .09 : .07, ctx.currentTime + start + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + start + duration);
        osc.connect(gain).connect(ctx.destination); osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + duration);
      };
      if (ok) { tone(740, 0, .12); tone(988, .11, .18); tone(1318, .23, .22); }
      else { tone(220, 0, .15, 'sawtooth'); tone(165, .12, .22, 'sawtooth'); }
    } catch { /* audio is optional */ }
  }

  function showHit(ok, item) {
    clearTimeout(hitTimer.current); clearTimeout(shakeTimer.current);
    setHit({id:item.id, ok, label:item.label, x:item.x, y:item.y});
    if (!ok) { setShake(true); shakeTimer.current = setTimeout(() => setShake(false), 380); }
    hitTimer.current = setTimeout(() => setHit(null), 650);
    sound(ok);
  }

  function startGame() {
    if (!playerName.trim()) {
      setPage('home'); setNameError(true);
      setTimeout(() => nameRef.current?.focus(), 0);
      return;
    }
    saved.current = false; keys.current = {left:false,right:false};
    setNameError(false); setHit(null); setShake(false); freezeUntil.current = 0;
    setGame({time:GAME_SECONDS, score:0, caught:0, missed:0, x:50, items:[]});
    lastFrame.current = 0; spawnTime.current = 0; setPage('game');
  }

  useEffect(() => {
    const down = e => { if (['ArrowLeft','a','A'].includes(e.key)) { keys.current.left = true; e.preventDefault(); } if (['ArrowRight','d','D'].includes(e.key)) { keys.current.right = true; e.preventDefault(); } };
    const up = e => { if (['ArrowLeft','a','A'].includes(e.key)) keys.current.left = false; if (['ArrowRight','d','D'].includes(e.key)) keys.current.right = false; };
    const blur = () => { keys.current = {left:false,right:false}; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  useEffect(() => {
    if (page !== 'game') return;
    let raf;
    const frame = timestamp => {
      if (!lastFrame.current) lastFrame.current = timestamp;
      if (timestamp < freezeUntil.current) { lastFrame.current = timestamp; raf = requestAnimationFrame(frame); return; }
      const dt = Math.min((timestamp - lastFrame.current) / 1000, .05);
      lastFrame.current = timestamp; spawnTime.current += dt;
      const shouldSpawn = spawnTime.current >= .76;
      if (shouldSpawn) spawnTime.current = 0;
      const prev = gameRef.current;
        const dropSpeedMultiplier = prev.time <= 5 ? 2 : prev.time <= 10 ? 1.8 : prev.time <= 15 ? 1.6 : 1;
        const x = Math.max(9, Math.min(91, prev.x + ((keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0)) * 55 * dt));
        let score = prev.score, caught = prev.caught, missed = prev.missed;
        let wrongThisFrame = false;
        const arenaHeight = arenaRef.current?.clientHeight || 400;
        const catchY = (arenaHeight - 94) / arenaHeight * 100;
        const items = [...prev.items, ...(shouldSpawn ? [randomItem()] : [])].map(item => ({...item, y:item.y + item.speed * dropSpeedMultiplier * dt})).filter(item => {
          if (!wrongThisFrame && item.y >= catchY && item.y <= catchY + 8 && Math.abs(item.x - x) < 10) {
            const ok = item.kind === 'python'; score += ok ? 10 : -5; caught += ok ? 1 : 0; missed += ok ? 0 : 1;
            showHit(ok, item);
            if (!ok) { freezeUntil.current = timestamp + 200; wrongThisFrame = true; }
            return false;
          }
          if (item.y > 104) { if (item.kind === 'python') missed++; return false; }
          return true;
        });
        const time = Math.max(0, prev.time - dt);
        const next = {time, score:Math.max(0,score), caught, missed, x, items};
        gameRef.current = next;
        setGame(next);
        if (time === 0) setPage('result');
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); lastFrame.current = 0; };
  }, [page, muted]);

  useEffect(() => () => { clearTimeout(hitTimer.current); clearTimeout(shakeTimer.current); }, []);

  function saveScore() {
    if (saved.current) return;
    const name = playerName.trim().slice(0, 18);
    const next = [...scores, {name, score:game.score, caught:game.caught, date:new Date().toISOString()}].sort((a,b) => b.score-a.score).slice(0,10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setScores(next); saved.current = true; setPage('leaderboard');
  }

  return <div className="app-shell">
    <header className="site-header"><button className="brand" onClick={() => setPage('home')} aria-label="PyCatch home"><span className="brand-mark"><Code2 size={22} strokeWidth={2.7}/></span><span>py<span className="brand-accent">catch</span><span className="brand-dot">.</span></span></button><nav><button className={page==='home'?'active':''} onClick={() => setPage('home')}>Home</button><button className={page==='leaderboard'?'active':''} onClick={() => setPage('leaderboard')}>Leaderboard</button></nav><button className="sound-button" onClick={() => setMuted(!muted)} aria-label={muted?'Unmute':'Mute'}>{muted?<VolumeX size={19}/>:<Volume2 size={19}/>}</button></header>
    {page === 'home' && <main className="home"><div className="home-copy"><div className="eyebrow"><span className="live-dot"/> THE LIBRARY CATCHING GAME</div><h1>Think fast.<br/><span>Catch Python.</span></h1><p className="intro">Libraries are falling from the sky. Move your basket, grab the Python ones, and dodge the rest. You have 45 seconds to prove your skills.</p><div className="name-entry"><label htmlFor="player-name">YOUR NAME TO PLAY</label><input id="player-name" ref={nameRef} value={playerName} maxLength={18} placeholder="Enter your name" aria-invalid={nameError} onChange={e=>{setPlayerName(e.target.value);setNameError(false)}} onKeyDown={e=>{if(e.key==='Enter')startGame()}}/>{nameError&&<small>Please enter your name to start.</small>}</div><div className="hero-actions"><button className="primary-button" onClick={startGame}><Play size={18} fill="currentColor"/> Play now <ArrowUpRight size={18}/></button><button className="text-button" onClick={() => setPage('leaderboard')}>View leaderboard <ArrowRight size={18}/></button></div><a className="jetbrains-credit" href="https://www.jetbrains.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit JetBrains"><img src={`${import.meta.env.BASE_URL}jetbrains.svg`} alt="JetBrains"/></a><div className="quick-stats"><div><strong>45<span>s</span></strong><small>on the clock</small></div><div><strong>+10</strong><small>per Python library</small></div><div><strong>−5</strong><small>for a wrong catch</small></div></div></div><div className="hero-art"><div className="art-grid"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="floating-card card-numpy"><span className="card-icon python-icon">Py</span><span>NumPy</span><span className="mini-check">✓</span></div><div className="floating-card card-react"><span className="card-icon react-icon">✳</span><span>React</span><span className="mini-cross">×</span></div><div className="floating-card card-django"><span className="card-icon django-icon">Dj</span><span>Django</span><span className="mini-check">✓</span></div><div className="floating-card card-spring"><span className="card-icon spring-icon">S</span><span>Spring</span><span className="mini-cross">×</span></div><div className="hero-basket"><div className="basket-rim"/><div className="basket-body"><div className="basket-panel red"/><div className="basket-panel blue"/><span className="basket-logo"><img src={`${import.meta.env.BASE_URL}pyconlogo.svg`} alt="PyCon HK 2026"/></span></div></div><div className="art-caption"><span className="caption-spark">✦</span> ONLY PYTHON MAKES THE CUT</div></div><div className="how-to"><div className="section-label">HOW TO PLAY <span>·</span> THREE SIMPLE STEPS</div><div className="steps"><div className="step"><span className="step-icon"><Keyboard size={22}/></span><div><h3>Move your basket</h3><p>Use ← → arrow keys, A / D, or the touch controls.</p></div></div><div className="step"><span className="step-icon"><BookOpen size={22}/></span><div><h3>Spot the Python libs</h3><p>Catch Python libraries. Let Java and JavaScript pass.</p></div></div><div className="step"><span className="step-icon"><Trophy size={22}/></span><div><h3>Beat the clock</h3><p>Score as many points as you can in 45 seconds.</p></div></div></div></div></main>}
    {page === 'game' && <main className="game-page"><a className="game-jetbrains-banner" href="https://www.jetbrains.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit JetBrains"><img src={`${import.meta.env.BASE_URL}jetbrains.svg`} alt="JetBrains"/><span>THE LIBRARY CATCHING GAME</span></a><div className="game-topline"><div><div className="eyebrow"><span className="live-dot"/> GAME IN PROGRESS</div><h1>Catch the <span>Python.</span></h1></div><button className="quit-button" onClick={() => setPage('home')}><X size={17}/> Quit game</button></div><div className="game-stats"><div><span>YOUR SCORE</span><strong>{game.score}</strong></div><div><span>TIME LEFT</span><strong className={game.time<10?'urgent':''}>{Math.ceil(game.time)}<small>s</small></strong></div><div><span>PYTHON CAUGHT</span><strong>{game.caught}</strong></div></div><div ref={arenaRef} className={`arena ${shake ? 'arena-shake' : ''}`} role="application" aria-label="Catch Python libraries with your basket"><div className="arena-grid"/><div className={`arena-top ${game.time <= 15 ? 'speed-up' : ''}`}>{game.time <= 5 ? '⚡ FINAL 5 SECONDS · 200% SPEED' : game.time <= 10 ? '⚡ FINAL 10 SECONDS · 180% SPEED' : game.time <= 15 ? '⚡ SPEED UP · 160% SPEED' : '↓ ITEMS ARE FALLING'}</div>{game.items.map(item => <div key={item.id} className={`falling-item ${item.kind}`} style={{left:`${item.x}%`,top:`${item.y}%`}}><span className="item-dot"/>{item.label}</div>)}{hit&&<div key={hit.id} className={`hit-effect ${hit.ok ? 'good' : 'bad'}`} style={{left:`${hit.x}%`,top:`${hit.y}%`}}><span className="hit-ring"/><span className="hit-particles">✦ ✧ ✦</span><strong>{hit.ok ? `+10 ${hit.label}` : `−5 ${hit.label}`}</strong><span className="hit-word">{hit.ok ? 'BING BING!' : 'WRONG LIBRARY!'}</span></div>}<div className={`game-basket ${hit ? (hit.ok ? 'basket-good' : 'basket-bad') : ''}`} style={{left:`${game.x}%`}}><div className="basket-rim"/><div className="basket-body"><div className="basket-panel red"/><div className="basket-panel blue"/><span className="basket-logo"><img src={`${import.meta.env.BASE_URL}pyconlogo.svg`} alt="PyCon HK 2026"/></span></div></div><div className="arena-floor"/></div><div className="game-foot"><span><span className="green-dot"/> Catch Python <span className="foot-divider">·</span> Avoid Java & JavaScript</span><div className="touch-controls"><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.left=true}} onPointerUp={()=>keys.current.left=false} onPointerCancel={()=>keys.current.left=false} aria-label="Move left"><ArrowLeft size={24} strokeWidth={2.5}/></button><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.right=true}} onPointerUp={()=>keys.current.right=false} onPointerCancel={()=>keys.current.right=false} aria-label="Move right"><ArrowRight size={24} strokeWidth={2.5}/></button></div><span className="desktop-hint">← → or A / D to move</span></div></main>}
    {page === 'result' && <main className="result-page"><div className="result-icon"><Award size={34}/></div><div className="eyebrow">TIME'S UP · NICE WORK</div><h1>Game Over</h1><p>Your 45-second run is complete. Save your score and see how you stack up.</p><div className="result-score"><span>FINAL SCORE</span><strong>{game.score}</strong><small>{game.caught} Python libraries caught</small></div><div className="result-player">Playing as <strong>{playerName}</strong></div><button className="primary-button result-save" onClick={saveScore}>Save score <ArrowRight size={18}/></button><button className="text-button" onClick={startGame}><RotateCcw size={17}/> Play again</button></main>}
    {page === 'leaderboard' && <main className="leaderboard-page"><div className="leader-head"><div><div className="eyebrow"><span className="live-dot"/> HALL OF FAME</div><h1>The <span>leaderboard.</span></h1><p>Top Python catchers, right here on this device.</p></div><button className="primary-button" onClick={startGame}><Play size={17} fill="currentColor"/> Play game <ArrowUpRight size={18}/></button></div><div className="leader-card"><div className="leader-header"><span>RANK / PLAYER</span><span>PYTHON CAUGHT</span><span>SCORE</span></div>{scores.length ? scores.map((entry,i)=><div className="leader-row" key={`${entry.date}-${i}`}><div className="leader-name"><span className={`rank rank-${i+1}`}>{i===0?'✦':String(i+1).padStart(2,'0')}</span><span>{entry.name}</span>{i===0&&<span className="top-badge">TOP CATCHER</span>}</div><span className="caught-count">{entry.caught}</span><strong>{entry.score}</strong></div>) : <div className="empty-board"><Trophy size={38}/><h2>No scores yet</h2><p>Be the first to catch some Python libraries.</p><button className="primary-button" onClick={startGame}>Start playing <ArrowRight size={17}/></button></div>}</div><button className="back-link" onClick={() => setPage('home')}><ArrowLeft size={17}/> Back to home</button></main>}
    <footer className="site-footer"><span>© 2026 pycatch. Made for curious minds. <a href="https://www.jetbrains.com/company/brand/" target="_blank" rel="noopener noreferrer">JetBrains logo © 2026 JetBrains s.r.o.</a></span><span>Catch code. Have fun. <span className="footer-star">✳</span></span></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
